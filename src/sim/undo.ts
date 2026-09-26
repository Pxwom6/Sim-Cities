import type { RoadTypeId } from '../data/roads';
import type { SplitRecord } from './world/roadPlanner';

/** Undo records for placements (SPEC: undo reverses the most recent placement). */
export type UndoRecord =
  | { kind: 'road'; tick: number; cost: number; segments: number[]; nodes: number[]; splits: SplitRecord[] }
  | { kind: 'zone'; tick: number; cells: [number, number, number][]; stroke?: number }
  | { kind: 'civic'; tick: number; id: number; cost: number }
  | { kind: 'upgrade'; tick: number; cost: number; seg: number; from: RoadTypeId }
  | { kind: 'stop'; tick: number; id: number; cost: number };

export const UNDO_LIMIT = 12;
