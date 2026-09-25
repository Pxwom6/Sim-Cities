import { GAME_TITLE } from '../config';
import { canonicalStringify, decodeValue, encodeValue } from './serialize';
import type { SimState } from './state';

/** Bump when the saved state shape changes, and add a migration from the previous version. */
export const SAVE_VERSION = 3;
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
export const migrations: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2 (M3): the economy (taxes, funding, loans, ledger) arrived. Start from defaults.
  1: (s) => {
    const funding: Record<string, number> = {};
    for (const d of [
      'roads',
      'power',
      'water',
      'sewage',
      'garbage',
      'fire',
      'police',
      'health',
      'education',
      'parks',
      'transit',
    ])
      funding[d] = 100;
    return {
      ...s,
      economy: {
        taxes: { R: [9, 9, 9], C: [9, 9, 9], I: [9, 9, 9] },
        funding,
        loans: [],
        month: {},
        carry: {},
        monthStartTreasury: s.treasury,
        history: [],
        negativeHours: 0,
        bankrupt: false,
      },
    };
  },
  // v2 → v3 (M4): utilities, garbage, civic buildings, vehicles and ground pollution.
  2: (s) => {
    const blds = s.buildings as { $m: [number, Record<string, unknown>][] };
    for (const [, b] of blds.$m)
      Object.assign(b, {
        power: 1,
        water: 1,
        sewage: 1,
        polluted: 0,
        garbage: 0,
        noPowerH: 0,
        noWaterH: 0,
        closed: false,
      });
    const zeros = encodeValue(new Float32Array(128 * 128));
    const stat = { supply: 0, demand: 0, served: 0, unserved: 0 };
    return {
      ...s,
      civics: { $m: [] },
      vehicles: { $m: [] },
      groundPollution: zeros,
      utilityStats: { power: { ...stat }, water: { ...stat }, sewage: { ...stat } },
      unlockAll: false,
    };
  },
};

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
