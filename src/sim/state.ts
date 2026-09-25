import type { MapPreset } from '../data/world';
import type { RngState } from './rng';
import type { NetworkState } from './world/network';
import type { UndoRecord } from './undo';
import type { Building } from './world/buildings';
import type { CityTotals } from './systems/totals';
import type { DemandState } from './systems/demand';
import type { EconomyState } from './systems/economy';
import type { Civic } from './world/civic';
import type { Vehicle } from './systems/vehicles';
import type { UtilityStats } from './systems/utilities';
import type { Incident } from './systems/incidents';
import type { TransitState } from './systems/transit';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameOptions {
  seed: string;
  preset: MapPreset;
  difficulty: Difficulty;
  sandbox: boolean;
  disasters: boolean;
  cityName: string;
}

export const DEFAULT_OPTIONS: GameOptions = {
  seed: 'citybloom',
  preset: 'river',
  difficulty: 'normal',
  sandbox: false,
  disasters: true,
  cityName: 'New Town',
};

export const RNG_STREAMS = ['world', 'growth', 'events', 'traffic', 'disasters'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

/**
 * Everything that is saved. Derived data (road adjacency, spatial indexes, terrain heights) lives
 * in `Sim` and is rebuilt on load. DESIGN.md §2.2.
 */
export interface SimState {
  version: number;
  options: GameOptions;
  tick: number;
  /** Next entity id (shared by every entity type; ids are never reused). */
  nextId: number;
  rng: Record<RngStream, RngState>;
  treasury: number;
  cityName: string;
  /** Tree density per raster cell (0..255); roads and buildings clear it. */
  trees: Uint8Array;
  net: NetworkState;
  /** The regional highway: off-map node and the connection node inside the map. */
  highway: { outside: number; connect: number; segment: number };
  undo: UndoRecord[];
  buildings: Map<number, Building>;
  totals: CityTotals;
  demand: DemandState;
  /** Land value raster (GRID_RES²), 0..1. */
  landValue: Float32Array;
  /** Round-robin positions of sliced systems. */
  cursors: { growth: number; matchRound: number };
  economy: EconomyState;
  civics: Map<number, Civic>;
  vehicles: Map<number, Vehicle>;
  /** Ground pollution raster (GRID_RES²), 0..1. */
  groundPollution: Float32Array;
  utilityStats: UtilityStats;
  /** Debug cheat: ignore unlock thresholds. */
  unlockAll: boolean;
  /** Buildings on fire (ids, ascending). */
  burning: number[];
  incidents: Map<number, Incident>;
  /** Crime raster (GRID_RES²), 0..1. */
  crime: Float32Array;
  /** Daily traffic per road segment (passenger-car units, both directions). */
  traffic: Map<number, number>;
  /** Bus stops and last round's ridership. */
  transit: TransitState;
}
