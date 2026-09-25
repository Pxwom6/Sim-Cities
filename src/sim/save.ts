import { GAME_TITLE } from '../config';
import { canonicalStringify, decodeValue, encodeValue } from './serialize';
import type { SimState } from './state';

/** Bump when the saved state shape changes, and add a migration from the previous version. */
export const SAVE_VERSION = 1;
export const SAVE_FORMAT = 'citybloom-save';

export interface SaveMeta {
  title: string;
  cityName: string;
  population: number;
  tick: number;
  savedAt: string;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  meta: SaveMeta;
  state: unknown;
}

/** migrations[v] converts an encoded state of version v into version v + 1. */
export const migrations: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {};

export function encodeState(state: SimState): unknown {
  return encodeValue(state);
}

export function makeSaveFile(state: SimState, population: number, savedAt: string): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    meta: { title: GAME_TITLE, cityName: state.cityName, population, tick: state.tick, savedAt },
    state: encodeState(state),
  };
}

export function readSaveFile(save: SaveFile): SimState {
  if (!save || save.format !== SAVE_FORMAT) throw new Error('Not a save file');
  if (save.version > SAVE_VERSION) throw new Error(`Save is from a newer version (${save.version})`);
  let encoded = save.state as Record<string, unknown>;
  for (let v = save.version; v < SAVE_VERSION; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    encoded = m(encoded);
  }
  const state = decodeValue(encoded) as SimState;
  state.version = SAVE_VERSION;
  return state;
}

export function stateToCanonicalJson(state: SimState): string {
  return canonicalStringify(encodeState(state));
}
