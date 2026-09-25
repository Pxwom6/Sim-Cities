/**
 * Player-placed civic buildings: utilities now (M4), services, parks and landmarks later.
 * Footprints are in metres (w along the road, d away from it). DESIGN.md §3.6–3.7.
 */
import type { Dept } from './economy';

export type Utility = 'power' | 'water' | 'sewage';
export type CivicCategory =
  | 'power'
  | 'water'
  | 'garbage'
  | 'fire'
  | 'police'
  | 'health'
  | 'education'
  | 'parks'
  | 'transit'
  | 'landmark'
  | 'special';

export interface CivicDef {
  id: string;
  name: string;
  category: CivicCategory;
  dept: Dept;
  w: number;
  d: number;
  cost: number;
  /** Monthly upkeep at 100 % funding. */
  upkeep: number;
  blurb: string;
  unlockPopulation: number;
  /** Utility output (units) at 100 % funding. */
  output?: Partial<Record<Utility, number>>;
  /** Pumps: output scales with groundwater under the site. */
  groundwater?: boolean;
  /** Must be placed within this many metres of open water. */
  nearWater?: number;
  /** Air / ground pollution emitted (0..1 scale per hour at the site). */
  airPollution?: number;
  groundPollution?: number;
  /** Radius (m) over which the pollution spreads from the site. */
  pollutionRadius?: number;
  /** Garbage handling. */
  garbage?: {
    trucks: number;
    truckCapacity: number;
    storage?: number;
    process?: number;
    revenuePerUnit?: number;
    powerPerUnit?: number;
  };
  /** Service coverage and capacity (M5). */
  service?: {
    kind: 'fire' | 'police' | 'health' | 'school' | 'park';
    range: number;
    vehicles?: number;
    capacity?: number;
  };
  /** Land-value effect radius (m) and strength (negative for nuisances). */
  landValue?: { radius: number; value: number };
  /** Model family for the renderer. */
  model: string;
}

export const CIVIC_DEFS: CivicDef[] = [
  // Power
  {
    id: 'wind',
    name: 'Wind turbines',
    category: 'power',
    dept: 'power',
    w: 16,
    d: 16,
    cost: 3_500,
    upkeep: 90,
    output: { power: 70 },
    blurb: 'Clean, cheap and small. A good start for a village.',
    unlockPopulation: 0,
    model: 'wind',
  },
  {
    id: 'coal',
    name: 'Coal power plant',
    category: 'power',
    dept: 'power',
    w: 40,
    d: 48,
    cost: 16_000,
    upkeep: 520,
    output: { power: 900 },
    airPollution: 1,
    groundPollution: 0.2,
    landValue: { radius: 240, value: -0.2 },
    blurb: 'Lots of power for the money, and lots of smoke.',
    unlockPopulation: 0,
    model: 'coal',
  },
  {
    id: 'gas',
    name: 'Gas power plant',
    category: 'power',
    dept: 'power',
    w: 32,
    d: 40,
    cost: 24_000,
    upkeep: 560,
    output: { power: 750 },
    airPollution: 0.35,
    landValue: { radius: 160, value: -0.08 },
    blurb: 'Cleaner than coal, pricier to run.',
    unlockPopulation: 1_200,
    model: 'gas',
  },
  {
    id: 'solar',
    name: 'Solar farm',
    category: 'power',
    dept: 'power',
    w: 48,
    d: 40,
    cost: 14_000,
    upkeep: 180,
    output: { power: 220 },
    blurb: 'Silent and clean; needs plenty of land.',
    unlockPopulation: 4_000,
    model: 'solar',
  },
  {
    id: 'nuclear',
    name: 'Nuclear power plant',
    category: 'power',
    dept: 'power',
    w: 56,
    d: 64,
    cost: 140_000,
    upkeep: 3_200,
    output: { power: 6_000 },
    landValue: { radius: 200, value: -0.1 },
    blurb: 'Enormous, clean output for a big city.',
    unlockPopulation: 40_000,
    model: 'nuclear',
  },
  // Water and sewage
  {
    id: 'pump',
    name: 'Groundwater pump',
    category: 'water',
    dept: 'water',
    w: 16,
    d: 16,
    cost: 5_000,
    upkeep: 160,
    output: { water: 260 },
    groundwater: true,
    blurb: 'Draws clean groundwater. Output depends on the water table (see the groundwater map).',
    unlockPopulation: 0,
    model: 'pump',
  },
  {
    id: 'riverpump',
    name: 'River pump',
    category: 'water',
    dept: 'water',
    w: 20,
    d: 20,
    cost: 8_000,
    upkeep: 260,
    output: { water: 650 },
    nearWater: 36,
    blurb: 'Pumps from a river or the sea. Keep sewage outflows away from it.',
    unlockPopulation: 0,
    model: 'riverpump',
  },
  {
    id: 'outflow',
    name: 'Sewage outflow',
    category: 'water',
    dept: 'sewage',
    w: 12,
    d: 16,
    cost: 2_500,
    upkeep: 60,
    output: { sewage: 900 },
    nearWater: 36,
    groundPollution: 1,
    pollutionRadius: 160,
    landValue: { radius: 180, value: -0.15 },
    blurb: 'Cheap: pipes sewage straight into the water, polluting the ground and water nearby.',
    unlockPopulation: 0,
    model: 'outflow',
  },
  {
    id: 'treatment',
    name: 'Sewage treatment plant',
    category: 'water',
    dept: 'sewage',
    w: 32,
    d: 32,
    cost: 22_000,
    upkeep: 520,
    output: { sewage: 1_100 },
    landValue: { radius: 100, value: -0.05 },
    blurb: 'Cleans sewage before it goes anywhere.',
    unlockPopulation: 2_000,
    model: 'treatment',
  },
  // Garbage
  {
    id: 'landfill',
    name: 'Landfill',
    category: 'garbage',
    dept: 'garbage',
    w: 48,
    d: 48,
    cost: 9_000,
    upkeep: 240,
    garbage: { trucks: 4, truckCapacity: 60, storage: 80_000 },
    groundPollution: 0.5,
    landValue: { radius: 200, value: -0.18 },
    blurb: 'Trucks collect garbage and bury it here until it fills up.',
    unlockPopulation: 0,
    model: 'landfill',
  },
  {
    id: 'recycling',
    name: 'Recycling centre',
    category: 'garbage',
    dept: 'garbage',
    w: 32,
    d: 32,
    cost: 18_000,
    upkeep: 380,
    garbage: { trucks: 3, truckCapacity: 60, process: 900, revenuePerUnit: 0.8 },
    landValue: { radius: 90, value: -0.05 },
    blurb: 'Collects and recycles garbage, earning a little from the materials.',
    unlockPopulation: 2_500,
    model: 'recycling',
  },
  {
    id: 'incinerator',
    name: 'Incinerator',
    category: 'garbage',
    dept: 'garbage',
    w: 32,
    d: 40,
    cost: 28_000,
    upkeep: 600,
    garbage: { trucks: 3, truckCapacity: 60, process: 1_400, powerPerUnit: 0.25 },
    airPollution: 0.6,
    landValue: { radius: 160, value: -0.12 },
    blurb: 'Burns garbage for a little power, and some smoke.',
    unlockPopulation: 6_000,
    model: 'incinerator',
  },
];

export const CIVIC = new Map(CIVIC_DEFS.map((d) => [d.id, d]));

/** Per-building consumption of utilities, per unit of capacity (residents or jobs). */
export const UTILITY_USE: Record<Utility, [number, number, number, number]> = {
  // index = zone code (0 unused, R, C, I)
  power: [0, 0.1, 0.16, 0.3],
  water: [0, 0.1, 0.08, 0.2],
  sewage: [0, 0.1, 0.08, 0.2],
};

export const UTILITIES = {
  /** Hours without power or water before a business closes. */
  closeAfterHours: 12,
  /** Ground pollution at a pump above which its water counts as polluted. */
  pollutedPumpThreshold: 0.25,
  /** Mood penalties at zero supply. */
  noPower: -0.28,
  noWater: -0.28,
  noSewage: -0.15,
  pollutedWater: -0.1,
};

export const GARBAGE = {
  /** Garbage made per day (one month cycle) per resident / job. */
  perResident: 0.35,
  perJob: [0, 0, 0.45, 0.9] as [number, number, number, number],
  /** Piles appear above this; mood suffers from here to `bad`. */
  visible: 20,
  bad: 60,
  moodPenalty: -0.15,
  /** A truck collects from its target and neighbours within this radius. */
  pickupRadius: 48,
  /** Coverage: road travel seconds from the facility. */
  range: 200,
};

/** Vehicles move this many metres per tick per (m/s of road speed); see DESIGN §3.7. */
export const VEHICLE_SPEED_SCALE = 0.2;
