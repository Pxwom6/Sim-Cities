import { fnv1a } from './hash';
import { Rng } from './rng';
import { fail, ok, type Command, type CommandLogEntry, type CommandResult } from './commands';
import { RNG_STREAMS, DEFAULT_OPTIONS, type GameOptions, type RngStream, type SimState } from './state';
import { Terrain } from './terrain/terrain';
import { SAVE_VERSION, makeSaveFile, readSaveFile, stateToCanonicalJson, type SaveFile } from './save';
import type {
  BlockData,
  BuildingData,
  CityStats,
  FrameDiff,
  NetDiff,
  NodeData,
  SegmentData,
  Snapshot,
  BuildingDetails,
  Query,
} from './protocol';
import { checkInvariants } from './invariants';
import { Network, type ZoneBlock } from './world/network';
import { UNDO_LIMIT, type UndoRecord } from './undo';
import { buildRoad, bulldoze, undoRoad } from './actions/roads';
import { undoZone, zone } from './actions/zoning';
import { v2 } from './geom';
import { GRID_RES } from '../data/world';
import {
  BState,
  buildingCapacity,
  defOf,
  footprint,
  placeOnLot,
  setLotCells,
  type Building,
} from './world/buildings';
import { RoadGraph } from './systems/graph';
import { SpatialHash } from './world/spatial';
import { computeTotals, emptyTotals } from './systems/totals';
import { emptyDemand, updateDemand } from './systems/demand';
import { updateLandValue, waterDistance } from './systems/landValue';
import { growthPass, lifecycle } from './systems/growth';
import { happinessFactors, updateHappiness } from './systems/happiness';
import { runMatcher } from './systems/commute';
import { GROWTH, HAPPINESS } from '../data/balance';
import { ZONE_R } from '../data/zones';
import { TICKS_PER_HOUR } from './time';

export const STARTING_FUNDS = { easy: 100_000, normal: 60_000, hard: 35_000 } as const;
const SANDBOX_FUNDS = 999_999_999;
/** The highway connection node sits this far inside the west edge. */
export const HIGHWAY_CONNECT_X = 24;

export type SimEvent = { kind: 'built' | 'abandoned' | 'upgrading' | 'demolished'; id: number };

/**
 * The simulation. Pure TypeScript, deterministic, runs in the worker and headlessly in tests.
 * All mutation goes through `dispatch` (commands) and `step` (one fixed tick).
 */
export class Sim {
  state: SimState;
  readonly terrain: Terrain;
  readonly rng: Record<RngStream, Rng>;
  readonly net: Network;
  /** Every applied command with the tick it was applied at (for replays). Not part of the hash. */
  readonly log: CommandLogEntry[] = [];
  /** When true, invariants are checked after every tick and violations throw. */
  testMode = false;
  /** Things that happened since the last frame (for notifications and sounds). Not saved. */
  events: SimEvent[] = [];

  private dirtyTrees = new Set<number>();
  private dirtyBuildings = new Set<number>();
  private removedBuildings = new Set<number>();
  private graphCache: RoadGraph | null = null;
  private blockOrderCache: number[] | null = null;
  private highwayComponent = -1;
  private waterDistCache: Float32Array | null = null;
  readonly bldHash = new SpatialHash(32);

  private constructor(state: SimState, terrain: Terrain) {
    this.state = state;
    this.terrain = terrain;
    this.rng = {} as Record<RngStream, Rng>;
    for (const s of RNG_STREAMS) this.rng[s] = new Rng(state.rng[s]);
    this.net = new Network(state.net, terrain, {
      nextId: () => this.state.nextId++,
      footprintBlocked: () => false,
      buildingMoved: (id, block, col) => this.buildingMoved(id, block, col),
      buildingLost: (id) => this.removeBuilding(id),
    });
    for (const b of state.buildings.values()) this.indexBuilding(b);
  }

  static create(opts: Partial<GameOptions> = {}): Sim {
    const options: GameOptions = { ...DEFAULT_OPTIONS, ...opts };
    const terrain = new Terrain(options.seed, options.preset);
    const rng = {} as SimState['rng'];
    for (const s of RNG_STREAMS) rng[s] = Rng.fromSeed(`${options.seed}:${s}`).getState();
    const state: SimState = {
      version: SAVE_VERSION,
      options,
      tick: 0,
      nextId: 1,
      rng,
      treasury: options.sandbox ? SANDBOX_FUNDS : STARTING_FUNDS[options.difficulty],
      cityName: options.cityName,
      trees: terrain.initialTrees.slice(),
      net: { nodes: new Map(), segments: new Map(), blocks: new Map() },
      highway: { outside: 0, connect: 0, segment: 0 },
      undo: [],
      buildings: new Map(),
      totals: emptyTotals(),
      demand: emptyDemand(),
      landValue: new Float32Array(GRID_RES * GRID_RES),
      cursors: { growth: 0, matchRound: 0 },
    };
    const sim = new Sim(state, terrain);
    sim.buildHighway();
    updateLandValue(sim, true);
    updateDemand(sim);
    return sim;
  }

  static fromSave(save: SaveFile): Sim {
    const state = readSaveFile(save);
    const terrain = new Terrain(state.options.seed, state.options.preset);
    return new Sim(state, terrain);
  }

  private buildHighway(): void {
    const hw = this.terrain.gen.params.highway;
    const outside = this.net.createNode(hw.lineX, hw.connectZ);
    const connect = this.net.createNode(HIGHWAY_CONNECT_X, hw.connectZ);
    const seg = this.net.createSegment(
      outside.id,
      connect.id,
      v2((hw.lineX + HIGHWAY_CONNECT_X) / 2, hw.connectZ),
      'highway',
      { zoned: false },
    );
    this.state.highway = { outside: outside.id, connect: connect.id, segment: seg.id };
  }

  get tick(): number {
    return this.state.tick;
  }

  // ---------------------------------------------------------------- money (full ledger in M3)

  spend(amount: number, _category: string): void {
    this.state.treasury -= Math.round(amount);
  }

  earn(amount: number, _category: string): void {
    this.state.treasury += Math.round(amount);
  }

  /** Tax rate (percent) for a zone and wealth level. Taxes arrive in M3. */
  taxRate(_zone: 'R' | 'C' | 'I', _wealth: number): number {
    return 9;
  }

  avgTax(zone: 'R' | 'C' | 'I'): number {
    return (this.taxRate(zone, 0) + this.taxRate(zone, 1) + this.taxRate(zone, 2)) / 3;
  }

  // ---------------------------------------------------------------- derived caches

  graph(): RoadGraph {
    if (!this.graphCache) {
      this.graphCache = new RoadGraph(this.net);
      this.highwayComponent = this.graphCache.componentOfNode(this.state.highway.connect);
    }
    return this.graphCache;
  }

  isSegmentConnected(segId: number): boolean {
    const seg = this.state.net.segments.get(segId);
    if (!seg) return false;
    const g = this.graph();
    return g.componentOfNode(seg.a) === this.highwayComponent;
  }

  isBuildingConnected(b: Building): boolean {
    const block = this.state.net.blocks.get(b.block);
    return !!block && this.isSegmentConnected(block.seg);
  }

  highwayConnectedBlocks(): number {
    let n = 0;
    for (const b of this.state.net.blocks.values()) if (this.isSegmentConnected(b.seg)) n++;
    return n;
  }

  blockOrder(): number[] {
    if (!this.blockOrderCache) this.blockOrderCache = [...this.state.net.blocks.keys()].sort((a, b) => a - b);
    return this.blockOrderCache;
  }

  waterDist(): Float32Array {
    if (!this.waterDistCache) this.waterDistCache = waterDistance(this);
    return this.waterDistCache;
  }

  markNetworkChanged(): void {
    this.graphCache = null;
    this.blockOrderCache = null;
  }

  // ---------------------------------------------------------------- buildings

  private indexBuilding(b: Building): void {
    const r = footprint(b);
    const rad = Math.hypot(r.hw, r.hd);
    this.bldHash.insert(b.id, { minX: b.x - rad, minZ: b.z - rad, maxX: b.x + rad, maxZ: b.z + rad });
  }

  markBuildingDirty(id: number): void {
    this.dirtyBuildings.add(id);
    const b = this.state.buildings.get(id);
    if (b) this.indexBuilding(b);
  }

  private buildingMoved(id: number, block: number, col: number): void {
    const b = this.state.buildings.get(id);
    if (!b) return;
    b.block = block;
    b.col = col;
    placeOnLot(this, b);
    this.markBuildingDirty(id);
  }

  removeBuilding(id: number): void {
    const b = this.state.buildings.get(id);
    if (!b) return;
    setLotCells(this, b, 0);
    this.net.clearBuildingCells(id);
    this.state.buildings.delete(id);
    this.bldHash.remove(id);
    this.dirtyBuildings.delete(id);
    this.removedBuildings.add(id);
    this.events.push({ kind: 'demolished', id });
  }

  // ---------------------------------------------------------------- commands

  dispatch(cmd: Command): CommandResult {
    const result = this.apply(cmd, false);
    if (result.ok) this.log.push({ tick: this.state.tick, cmd: JSON.parse(JSON.stringify(cmd)) as Command });
    return result;
  }

  /** Dry run: validity and cost without changing any state. */
  preview(cmd: Command): CommandResult {
    return this.apply(cmd, true);
  }

  private apply(cmd: Command, dryRun: boolean): CommandResult {
    switch (cmd.type) {
      case 'cheat': {
        if (!Number.isFinite(cmd.amount)) return fail('Invalid amount');
        if (!dryRun) this.earn(cmd.amount, 'cheats');
        return ok(0);
      }
      case 'renameCity': {
        const name = cmd.name.trim().slice(0, 40);
        if (!name) return fail('Name cannot be empty');
        if (!dryRun) this.state.cityName = name;
        return ok(0);
      }
      case 'buildRoad':
        return buildRoad(this, cmd.road, cmd.points, dryRun);
      case 'bulldoze':
        return bulldoze(this, cmd.target, dryRun);
      case 'zone':
        return zone(this, cmd.zone, cmd.area, dryRun, cmd.stroke);
      case 'undo':
        return this.undo(dryRun);
      default: {
        const never: never = cmd;
        return fail(`Unknown command ${(never as { type: string }).type}`);
      }
    }
  }

  pushUndo(rec: UndoRecord): void {
    this.state.undo.push(rec);
    if (this.state.undo.length > UNDO_LIMIT) this.state.undo.shift();
  }

  private undo(dryRun: boolean): CommandResult {
    const rec = this.state.undo[this.state.undo.length - 1];
    if (!rec) return fail('Nothing to undo');
    const res = rec.kind === 'road' ? undoRoad(this, rec, dryRun) : undoZone(this, rec.cells, dryRun);
    if (!dryRun) this.state.undo.pop();
    return res;
  }

  // ---------------------------------------------------------------- time

  step(): void {
    const s = this.state;
    s.tick++;
    const t = s.tick;
    if (t % GROWTH.passInterval === 0) growthPass(this);
    if (t % TICKS_PER_HOUR === 0) {
      if (t % (TICKS_PER_HOUR * 2) === 0) runMatcher(this);
      updateHappiness(this);
      lifecycle(this);
      s.totals = computeTotals(this);
      updateDemand(this);
      if (t % (TICKS_PER_HOUR * 3) === 0) updateLandValue(this);
    }
    if (this.testMode) checkInvariants(this);
  }

  advance(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** Re-run a command log from a fresh sim: apply each entry at its tick. */
  static replay(opts: Partial<GameOptions>, log: CommandLogEntry[], untilTick: number): Sim {
    const sim = Sim.create(opts);
    let i = 0;
    for (;;) {
      while (i < log.length && log[i]!.tick === sim.tick) sim.dispatch(log[i++]!.cmd);
      if (sim.tick >= untilTick) break;
      sim.step();
    }
    return sim;
  }

  // ---------------------------------------------------------------- persistence

  private syncRng(): void {
    for (const s of RNG_STREAMS) this.state.rng[s] = this.rng[s].getState();
  }

  save(savedAt = ''): SaveFile {
    this.syncRng();
    return makeSaveFile(this.state, this.state.totals.population, savedAt);
  }

  hash(): string {
    this.syncRng();
    return fnv1a(stateToCanonicalJson(this.state));
  }

  // ---------------------------------------------------------------- views for the main thread

  stats(): CityStats {
    const t = this.state.totals;
    const d = this.state.demand;
    return {
      tick: this.state.tick,
      treasury: this.state.treasury,
      cityName: this.state.cityName,
      population: t.population,
      undoAvailable: this.state.undo.length > 0,
      jobs: t.jobs,
      jobsFilled: t.jobsFilled,
      unemployed: t.unemployed,
      workers: t.workers,
      approval: t.approval,
      demand: { R: d.R, C: d.C, I: d.I },
      demandFactors: d.factors,
      buildings: t.buildings,
      abandoned: t.abandoned,
      highwayConnected: t.highwayConnected,
    };
  }

  private netData(): { nodes: NodeData[]; segments: SegmentData[]; blocks: BlockData[] } {
    const n = this.state.net;
    return {
      nodes: [...n.nodes.values()].map((x) => ({ ...x })),
      segments: [...n.segments.values()].map((x) => ({ ...x })),
      blocks: [...n.blocks.values()].map(blockData),
    };
  }

  snapshot(): Snapshot {
    const d = this.net.dirty;
    const r = this.net.removed;
    for (const set of [
      d.nodes,
      d.segments,
      d.blocks,
      r.nodes,
      r.segments,
      r.blocks,
      this.dirtyBuildings,
      this.removedBuildings,
    ])
      set.clear();
    this.events = [];
    return {
      options: { ...this.state.options },
      terrainParams: this.terrain.gen.params,
      heights: this.terrain.heights.slice(),
      trees: this.state.trees.slice(),
      groundwater: this.terrain.groundwater.slice(),
      ore: this.terrain.ore.slice(),
      oil: this.terrain.oil.slice(),
      stats: this.stats(),
      net: this.netData(),
      highway: { ...this.state.highway },
      buildings: [...this.state.buildings.values()].map((b) => this.buildingData(b)),
    };
  }

  buildingData(b: Building): BuildingData {
    return {
      id: b.id,
      def: b.def,
      zone: b.zone,
      density: b.density,
      wealth: b.wealth,
      level: b.level,
      x: b.x,
      z: b.z,
      y: b.y,
      angle: b.angle,
      side: b.side,
      w: b.w,
      d: b.d,
      state: b.state,
      progress: b.progress,
      variant: b.variant,
      flags: this.isBuildingConnected(b) ? 0 : 1,
    };
  }

  /** Changes since the last call, for the main-thread mirror. */
  collectFrame(): FrameDiff {
    const frame: FrameDiff = { tick: this.state.tick, stats: this.stats() };
    if (this.dirtyTrees.size) {
      const idx = [...this.dirtyTrees].sort((a, b) => a - b);
      frame.trees = { idx, val: idx.map((i) => this.state.trees[i]!) };
      this.dirtyTrees.clear();
    }
    const d = this.net.dirty;
    const r = this.net.removed;
    if (
      d.nodes.size ||
      d.segments.size ||
      d.blocks.size ||
      r.nodes.size ||
      r.segments.size ||
      r.blocks.size
    ) {
      const n = this.state.net;
      const diff: NetDiff = {
        nodes: [...d.nodes]
          .filter((id) => n.nodes.has(id))
          .sort((a, b) => a - b)
          .map((id) => ({ ...n.nodes.get(id)! })),
        segments: [...d.segments]
          .filter((id) => n.segments.has(id))
          .sort((a, b) => a - b)
          .map((id) => ({ ...n.segments.get(id)! })),
        blocks: [...d.blocks]
          .filter((id) => n.blocks.has(id))
          .sort((a, b) => a - b)
          .map((id) => blockData(n.blocks.get(id)!)),
        removedNodes: [...r.nodes].sort((a, b) => a - b),
        removedSegments: [...r.segments].sort((a, b) => a - b),
        removedBlocks: [...r.blocks].sort((a, b) => a - b),
      };
      frame.net = diff;
      for (const s of [d.nodes, d.segments, d.blocks, r.nodes, r.segments, r.blocks]) s.clear();
    }
    if (this.dirtyBuildings.size || this.removedBuildings.size) {
      frame.buildings = {
        upserts: [...this.dirtyBuildings]
          .filter((id) => this.state.buildings.has(id))
          .sort((a, b) => a - b)
          .map((id) => this.buildingData(this.state.buildings.get(id)!)),
        removed: [...this.removedBuildings].sort((a, b) => a - b),
      };
      this.dirtyBuildings.clear();
      this.removedBuildings.clear();
    }
    if (this.events.length) {
      frame.events = this.events;
      this.events = [];
    }
    return frame;
  }

  markTreesDirty(idx: number): void {
    this.dirtyTrees.add(idx);
  }

  // ---------------------------------------------------------------- queries

  query(q: Query): unknown {
    switch (q.type) {
      case 'hash':
        return this.hash();
      case 'summary':
        return this.stats();
      case 'building':
        return this.buildingDetails(q.id);
    }
  }

  buildingDetails(id: number): BuildingDetails | null {
    const b = this.state.buildings.get(id);
    if (!b) return null;
    const def = defOf(b);
    const factors = b.state === BState.Active || b.pop > 0 ? happinessFactors(this, b) : [];
    return {
      id: b.id,
      name: def.name,
      zone: b.zone,
      density: b.density,
      wealth: b.wealth,
      level: b.level,
      state: b.state,
      progress: b.progress,
      pop: b.pop,
      cap: b.cap || buildingCapacity(b),
      employed: b.employed,
      commute: b.commute,
      shop: b.shop,
      happiness: b.happiness,
      base: HAPPINESS.base,
      factors,
      distress: b.distress,
      abandonAt: GROWTH.abandonAt,
      isResidential: b.zone === ZONE_R,
      connected: this.isBuildingConnected(b),
      born: b.born,
    };
  }
}

function blockData(b: ZoneBlock): BlockData {
  return {
    id: b.id,
    seg: b.seg,
    side: b.side,
    s0: b.s0,
    cols: b.cols,
    zone: b.zone.slice(),
    valid: b.valid.slice(),
    bld: b.bld.slice(),
  };
}
