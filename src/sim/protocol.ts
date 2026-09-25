/** Typed messages between the main thread and the sim worker. DESIGN.md §1.4. */
import type { TerrainParams } from './terrain/generate';
import type { Command, CommandResult } from './commands';
import type { GameOptions } from './state';
import type { SaveFile } from './save';
import type { Speed } from './time';
import type { RoadTypeId } from '../data/roads';

export interface CityStats {
  tick: number;
  treasury: number;
  cityName: string;
  population: number;
  undoAvailable: boolean;
}

export interface NodeData {
  id: number;
  x: number;
  z: number;
}
export interface SegmentData {
  id: number;
  a: number;
  b: number;
  cx: number;
  cz: number;
  type: RoadTypeId;
  left: number;
  right: number;
}
export interface BlockData {
  id: number;
  seg: number;
  side: 1 | -1;
  s0: number;
  cols: number;
  zone: Uint8Array;
  valid: Uint8Array;
  bld: Int32Array;
}
export interface NetDiff {
  nodes: NodeData[];
  segments: SegmentData[];
  blocks: BlockData[];
  removedNodes: number[];
  removedSegments: number[];
  removedBlocks: number[];
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
  net: { nodes: NodeData[]; segments: SegmentData[]; blocks: BlockData[] };
  highway: { outside: number; connect: number; segment: number };
}

export interface FrameDiff {
  tick: number;
  stats: CityStats;
  /** Tree density changes: raster index → new density. */
  trees?: { idx: number[]; val: number[] };
  net?: NetDiff;
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
