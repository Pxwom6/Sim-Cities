/**
 * Zoned building archetypes: zone × density × wealth × level. Footprints are in zone cells
 * (w columns along the road × d rows deep). DESIGN.md §3.4.
 */
import { ZONE_C, ZONE_I, ZONE_R, type ZoneCode } from './zones';

export type Density = 0 | 1 | 2;
export type Wealth = 0 | 1 | 2;
export type Level = 1 | 2 | 3;

export interface ZonedDef {
  id: string;
  zone: ZoneCode;
  density: Density;
  wealth: Wealth;
  level: Level;
  /** Columns along the road. */
  w: number;
  /** Rows deep. */
  d: number;
  /** Residents (R) or jobs (C/I). */
  capacity: number;
  /** Construction time in ticks (game minutes). */
  buildTicks: number;
  /** Rough storey count for the procedural model. */
  floors: number;
  name: string;
}

export const DENSITY_NAMES = ['Low density', 'Medium density', 'High density'] as const;
export const WEALTH_NAMES = ['Low wealth', 'Medium wealth', 'High wealth'] as const;
export const INDUSTRY_TIER_NAMES = ['Heavy industry', 'Manufacturing', 'High-tech'] as const;

// [w, d, base capacity, floors] per density and level.
const R_SHAPES: Record<Density, [number, number, number, number][]> = {
  0: [
    [1, 2, 5, 1],
    [2, 2, 8, 2],
    [2, 3, 12, 2],
  ],
  1: [
    [2, 2, 24, 3],
    [2, 3, 44, 4],
    [3, 3, 76, 6],
  ],
  2: [
    [2, 3, 140, 10],
    [3, 3, 250, 16],
    [3, 4, 420, 24],
  ],
};
const C_SHAPES: Record<Density, [number, number, number, number][]> = {
  0: [
    [1, 1, 5, 1],
    [1, 2, 9, 1],
    [2, 2, 16, 2],
  ],
  1: [
    [2, 2, 30, 3],
    [2, 3, 52, 4],
    [3, 3, 84, 6],
  ],
  2: [
    [2, 3, 120, 10],
    [3, 3, 210, 16],
    [3, 4, 330, 26],
  ],
};
const I_SHAPES: Record<Density, [number, number, number, number][]> = {
  0: [
    [2, 2, 18, 1],
    [2, 3, 30, 1],
    [3, 3, 46, 2],
  ],
  1: [
    [2, 3, 56, 2],
    [3, 3, 86, 2],
    [3, 4, 124, 3],
  ],
  2: [
    [3, 3, 130, 3],
    [3, 4, 190, 4],
    [4, 4, 260, 5],
  ],
};

/** Wealthier households are smaller; wealthier businesses employ a bit fewer, better-paid people. */
const R_WEALTH_CAP = [1.0, 0.85, 0.7];
const CI_WEALTH_CAP = [1.0, 0.92, 0.85];
const R_NAMES: Record<Density, string[]> = {
  0: ['Cottage', 'Family house', 'Villa'],
  1: ['Townhouses', 'Apartment block', 'Courtyard apartments'],
  2: ['Residential tower', 'High-rise', 'Skyline residences'],
};
const C_NAMES: Record<Density, string[]> = {
  0: ['Corner shop', 'Shopfront', 'Market hall'],
  1: ['Shopping row', 'Office block', 'Department store'],
  2: ['Office tower', 'Commercial tower', 'Headquarters'],
};
const I_NAMES: Record<Density, string[]> = {
  0: ['Workshop', 'Warehouse', 'Plant'],
  1: ['Factory', 'Assembly works', 'Industrial complex'],
  2: ['Big factory', 'Processing works', 'Industrial park'],
};

function makeDefs(): Map<string, ZonedDef> {
  const out = new Map<string, ZonedDef>();
  const zones: [ZoneCode, Record<Density, [number, number, number, number][]>, Record<Density, string[]>][] =
    [
      [ZONE_R, R_SHAPES, R_NAMES],
      [ZONE_C, C_SHAPES, C_NAMES],
      [ZONE_I, I_SHAPES, I_NAMES],
    ];
  for (const [zone, shapes, names] of zones) {
    for (const density of [0, 1, 2] as Density[]) {
      for (const wealth of [0, 1, 2] as Wealth[]) {
        for (const level of [1, 2, 3] as Level[]) {
          const [w, d, cap, floors] = shapes[density][level - 1]!;
          const mult = zone === ZONE_R ? R_WEALTH_CAP[wealth]! : CI_WEALTH_CAP[wealth]!;
          const id = zonedDefId(zone, density, wealth, level);
          out.set(id, {
            id,
            zone,
            density,
            wealth,
            level,
            w,
            d,
            capacity: Math.max(2, Math.round(cap * mult)),
            buildTicks: 90 + density * 110 + level * 30,
            floors,
            name: names[density][level - 1]!,
          });
        }
      }
    }
  }
  return out;
}

export function zonedDefId(zone: ZoneCode, density: Density, wealth: Wealth, level: Level): string {
  return `${'-RCI'[zone]}${density}${wealth}${level}`;
}

export const ZONED_DEFS = makeDefs();

export function zonedDef(zone: ZoneCode, density: Density, wealth: Wealth, level: Level): ZonedDef {
  return ZONED_DEFS.get(zonedDefId(zone, density, wealth, level))!;
}

/** Population needed before each density can grow (DESIGN §3.13; more unlocks arrive in M10). */
export const DENSITY_UNLOCK_POPULATION: Record<Density, number> = { 0: 0, 1: 800, 2: 5000 };
