import type { MapPreset } from '../data/world';
import type { RngState } from './rng';

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
  rng: Record<RngStream, RngState>;
  treasury: number;
  cityName: string;
  /** Tree density per raster cell (0..255); roads and buildings clear it. */
  trees: Uint8Array;
}
