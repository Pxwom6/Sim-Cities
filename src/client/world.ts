import { TerrainGen, sampleHeights } from '../sim/terrain/generate';
import type { CityStats, FrameDiff, Snapshot } from '../sim/protocol';
import type { GameOptions } from '../sim/state';
import { MAP_SIZE } from '../data/world';

type Listener = () => void;

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
  }

  /** Terrain height anywhere: the sim grid inside the map, the generator outside. */
  heightAt(x: number, z: number): number {
    if (x >= 0 && z >= 0 && x <= MAP_SIZE && z <= MAP_SIZE) return sampleHeights(this.heights, x, z);
    return this.gen.height(x, z);
  }

  applyFrame(diff: FrameDiff): void {
    this.stats = diff.stats;
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
