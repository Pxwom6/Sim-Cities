import type { RoadTypeId } from '../data/roads';
import type { SplitRecord } from './world/roadPlanner';
import type { TerrainEdit } from './world/earthworks';

/** Undo records for placements (SPEC: undo reverses the most recent placement). */
export type UndoRecord =
  | {
      kind: 'road';
      tick: number;
      cost: number;
      segments: number[];
      nodes: number[];
      splits: SplitRecord[];
      /** The ground its earthworks replaced (M13). */
      terrain?: TerrainEdit;
    }
  | { kind: 'zone'; tick: number; cells: [number, number, number][]; stroke?: number }
  | {
      kind: 'civic';
      tick: number;
      id: number;
      cost: number;
      /** The ground its level pad replaced, and what the pad cost (M13). */
      terrain?: TerrainEdit;
      earthCost?: number;
    }
  | {
      kind: 'upgrade';
      tick: number;
      cost: number;
      seg: number;
      from: RoadTypeId;
      /** The ground its regrading replaced (M13). */
      terrain?: TerrainEdit;
    }
  | { kind: 'stop'; tick: number; id: number; cost: number };

export const UNDO_LIMIT = 12;
