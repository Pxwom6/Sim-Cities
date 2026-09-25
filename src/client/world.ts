import { TerrainGen, sampleHeights } from '../sim/terrain/generate';
import type {
  BuildingData,
  CityStats,
  CivicData,
  FrameDiff,
  NetDiff,
  Snapshot,
  VehicleData,
} from '../sim/protocol';
import { Network, type NetworkState, type RoadSegment, type ZoneBlock } from '../sim/world/network';
import { SpatialHash } from '../sim/world/spatial';
import { CIVIC } from '../data/civic';
import type { GameOptions } from '../sim/state';
import { MAP_SIZE } from '../data/world';

type Listener = () => void;

export interface NetChanges {
  segments: Set<number>;
  nodes: Set<number>;
  blocks: Set<number>;
}

/**
 * Read-only mirror of the sim state that rendering and UI need, updated from worker frames.
 * Nothing here mutates the simulation; all changes go through commands.
 */
export class ClientWorld {
  readonly options: GameOptions;
  readonly gen: TerrainGen;
  readonly heights: Float32Array;
  readonly trees: Uint8Array;
  readonly groundwater: Uint8Array;
  readonly ore: Uint8Array;
  readonly oil: Uint8Array;
  stats: CityStats;
  readonly netState: NetworkState;
  /** Geometry-only view of the road network (curves, adjacency, cells, spatial queries). */
  readonly net: Network;
  readonly highway: Snapshot['highway'];
  private netListeners: ((c: NetChanges) => void)[] = [];
  readonly buildings = new Map<number, BuildingData>();
  /** Spatial index of building footprints (by bounding circle). */
  readonly bldHash = new SpatialHash(32);
  private buildingListeners: ((changed: number[], removed: number[]) => void)[] = [];
  readonly civics = new Map<number, CivicData>();
  private civicListeners: ((changed: number[], removed: number[]) => void)[] = [];
  /** Active service vehicles and the tick they were reported at (the renderer extrapolates). */
  vehicles: VehicleData[] = [];
  vehiclesTick = 0;
  /** Recent sim events (built, abandoned, ...) for notifications and sounds. */
  events: { kind: string; id: number }[] = [];
  /** Fractional tick, advanced smoothly between frames for lighting. */
  displayTick: number;
  private listeners = new Map<string, Set<Listener>>();

  constructor(snap: Snapshot) {
    this.options = snap.options;
    this.gen = new TerrainGen(snap.terrainParams);
    this.heights = snap.heights;
    this.trees = snap.trees;
    this.groundwater = snap.groundwater;
    this.ore = snap.ore;
    this.oil = snap.oil;
    this.stats = snap.stats;
    this.displayTick = snap.stats.tick;
    this.highway = snap.highway;
    this.netState = { nodes: new Map(), segments: new Map(), blocks: new Map() };
    for (const n of snap.net.nodes) this.netState.nodes.set(n.id, { ...n });
    for (const sg of snap.net.segments) this.netState.segments.set(sg.id, { ...sg });
    for (const b of snap.net.blocks) this.netState.blocks.set(b.id, { ...b });
    this.net = new Network(this.netState, null, null);
    for (const b of snap.buildings) this.setBuilding(b);
    for (const c of snap.civics) this.civics.set(c.id, c);
    this.vehicles = snap.vehicles;
    this.vehiclesTick = snap.stats.tick;
  }

  onCivics(l: (changed: number[], removed: number[]) => void): () => void {
    this.civicListeners.push(l);
    return () => {
      this.civicListeners = this.civicListeners.filter((x) => x !== l);
    };
  }

  /** Civic building whose footprint contains (x, z). */
  civicAt(x: number, z: number): CivicData | null {
    for (const c of this.civics.values()) {
      const d = CIVIC.get(c.def);
      if (!d) continue;
      const ca = Math.cos(c.angle);
      const sa = Math.sin(c.angle);
      const dx = x - c.x;
      const dz = z - c.z;
      const lx = dx * ca + dz * sa;
      const lz = -dx * sa + dz * ca;
      if (Math.abs(lx) <= d.w / 2 && Math.abs(lz) <= d.d / 2) return c;
    }
    return null;
  }

  private setBuilding(b: BuildingData): void {
    this.buildings.set(b.id, b);
    const r = Math.hypot(b.w * 4, b.d * 4);
    this.bldHash.insert(b.id, { minX: b.x - r, minZ: b.z - r, maxX: b.x + r, maxZ: b.z + r });
  }

  /** Building whose lot contains (x, z), if any. */
  buildingAt(x: number, z: number, margin = 0): BuildingData | null {
    for (const id of this.bldHash.queryPoint(x, z, 1)) {
      const b = this.buildings.get(id)!;
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      const dx = x - b.x;
      const dz = z - b.z;
      const lx = dx * c + dz * s;
      const lz = -dx * s + dz * c;
      if (Math.abs(lx) <= b.w * 4 + margin && Math.abs(lz) <= b.d * 4 + margin) return b;
    }
    return null;
  }

  onBuildings(l: (changed: number[], removed: number[]) => void): () => void {
    this.buildingListeners.push(l);
    return () => {
      this.buildingListeners = this.buildingListeners.filter((x) => x !== l);
    };
  }

  /** Subscribe to network changes (ids of touched segments, nodes and blocks, including removals). */
  onNet(l: (c: NetChanges) => void): () => void {
    this.netListeners.push(l);
    return () => {
      this.netListeners = this.netListeners.filter((x) => x !== l);
    };
  }

  private applyNet(d: NetDiff): void {
    const st = this.netState;
    const net = this.net;
    const ch: NetChanges = { segments: new Set(), nodes: new Set(), blocks: new Set() };
    for (const id of d.removedBlocks) {
      const b = st.blocks.get(id);
      if (!b) continue;
      net.unindexBlock(b);
      st.blocks.delete(id);
      ch.blocks.add(id);
    }
    const reindexBlocksOf = new Set<number>();
    for (const id of d.removedSegments) {
      const sg = st.segments.get(id);
      if (!sg) continue;
      net.unindexSegment(sg);
      st.segments.delete(id);
      ch.segments.add(id);
      ch.nodes.add(sg.a);
      ch.nodes.add(sg.b);
    }
    for (const n of d.nodes) {
      st.nodes.set(n.id, { ...n });
      if (!net.adj.has(n.id)) net.adj.set(n.id, []);
      ch.nodes.add(n.id);
    }
    for (const sgData of d.segments) {
      const old = st.segments.get(sgData.id);
      if (old) {
        net.unindexSegment(old);
        if (old.type !== sgData.type) reindexBlocksOf.add(sgData.id);
      }
      const sg: RoadSegment = { ...sgData };
      st.segments.set(sg.id, sg);
      net.indexSegment(sg);
      ch.segments.add(sg.id);
      ch.nodes.add(sg.a);
      ch.nodes.add(sg.b);
    }
    for (const bd of d.blocks) {
      const old = st.blocks.get(bd.id);
      const sameGeo =
        old &&
        old.seg === bd.seg &&
        old.side === bd.side &&
        old.s0 === bd.s0 &&
        old.cols === bd.cols &&
        !reindexBlocksOf.has(bd.seg);
      const b: ZoneBlock = { ...bd };
      if (sameGeo) {
        old.zone = b.zone;
        old.valid = b.valid;
        old.bld = b.bld;
      } else {
        if (old) net.unindexBlock(old);
        st.blocks.set(b.id, b);
        net.indexBlock(b);
      }
      ch.blocks.add(b.id);
    }
    for (const segId of reindexBlocksOf) {
      const sg = st.segments.get(segId);
      if (!sg) continue;
      for (const bid of [sg.left, sg.right]) {
        const b = bid ? st.blocks.get(bid) : undefined;
        if (!b) continue;
        net.unindexBlock(b);
        net.indexBlock(b);
        ch.blocks.add(bid);
      }
    }
    for (const id of d.removedNodes) {
      st.nodes.delete(id);
      net.adj.delete(id);
      ch.nodes.add(id);
    }
    for (const l of this.netListeners) l(ch);
    this.emit('net');
  }

  /** Terrain height anywhere: the sim grid inside the map, the generator outside. */
  heightAt(x: number, z: number): number {
    if (x >= 0 && z >= 0 && x <= MAP_SIZE && z <= MAP_SIZE) return sampleHeights(this.heights, x, z);
    return this.gen.height(x, z);
  }

  applyFrame(diff: FrameDiff): void {
    this.stats = diff.stats;
    if (diff.net) this.applyNet(diff.net);
    if (diff.buildings) {
      for (const id of diff.buildings.removed) {
        this.buildings.delete(id);
        this.bldHash.remove(id);
      }
      for (const b of diff.buildings.upserts) this.setBuilding(b);
      const changed = diff.buildings.upserts.map((b) => b.id);
      for (const l of this.buildingListeners) l(changed, diff.buildings.removed);
      this.emit('buildings');
    }
    if (diff.civics) {
      for (const id of diff.civics.removed) this.civics.delete(id);
      for (const c of diff.civics.upserts) this.civics.set(c.id, c);
      const changed = diff.civics.upserts.map((c) => c.id);
      for (const l of this.civicListeners) l(changed, diff.civics.removed);
      this.emit('civics');
    }
    if (diff.vehicles) {
      this.vehicles = diff.vehicles;
      this.vehiclesTick = diff.tick;
    }
    if (diff.events) {
      this.events = diff.events;
      this.emit('events');
    }
    if (diff.trees) {
      for (let k = 0; k < diff.trees.idx.length; k++) this.trees[diff.trees.idx[k]!] = diff.trees.val[k]!;
      this.emit('trees');
    }
    this.emit('stats');
  }

  on(topic: string, l: Listener): () => void {
    let set = this.listeners.get(topic);
    if (!set) this.listeners.set(topic, (set = new Set()));
    set.add(l);
    return () => set.delete(l);
  }

  emit(topic: string): void {
    this.listeners.get(topic)?.forEach((l) => l());
  }
}
