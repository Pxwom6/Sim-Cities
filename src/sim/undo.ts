import type { SplitRecord } from './world/roadPlanner';

/** Undo records for placements (SPEC: undo reverses the most recent placement). */
export type UndoRecord =
  | { kind: 'road'; tick: number; cost: number; segments: number[]; nodes: number[]; splits: SplitRecord[] }
  | { kind: 'zone'; tick: number; cells: [number, number, number][]; stroke?: number }
  | { kind: 'civic'; tick: number; id: number; cost: number };

export const UNDO_LIMIT = 12;
