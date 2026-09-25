/** Typed messages between the main thread and the sim worker. DESIGN.md §1.4. */
import type { TerrainParams } from './terrain/generate';
import type { Command, CommandResult } from './commands';
import type { GameOptions } from './state';
import type { SaveFile } from './save';
import type { Speed } from './time';

export interface CityStats {
  tick: number;
  treasury: number;
  cityName: string;
  population: number;
}

/** Everything the main thread needs to build its mirror and the scene. */
export interface Snapshot {
  options: GameOptions;
  terrainParams: TerrainParams;
  heights: Float32Array;
  trees: Uint8Array;
  groundwater: Uint8Array;
  ore: Uint8Array;
  oil: Uint8Array;
  stats: CityStats;
}

export interface FrameDiff {
  tick: number;
  stats: CityStats;
  /** Tree density changes: raster index → new density. */
  trees?: { idx: number[]; val: number[] };
}

export interface WorkerPerf {
  tickMsAvg: number;
  tickMsMax: number;
  ticksPerSecond: number;
  droppedTicks: number;
}

export type Query = { type: 'hash' } | { type: 'summary' };

export type MainToWorker =
  | { type: 'init'; options: Partial<GameOptions>; testMode?: boolean }
  | { type: 'load'; save: SaveFile; testMode?: boolean }
  | { type: 'command'; id: number; cmd: Command }
  | { type: 'preview'; id: number; cmd: Command }
  | { type: 'query'; id: number; q: Query }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'advance'; id: number; ticks: number }
  | { type: 'save'; id: number };

export type WorkerToMain =
  | { type: 'ready'; snapshot: Snapshot }
  | { type: 'frame'; diff: FrameDiff; perf: WorkerPerf; speed: Speed }
  | { type: 'reply'; id: number; result: unknown }
  | { type: 'error'; message: string };

export type { CommandResult };
