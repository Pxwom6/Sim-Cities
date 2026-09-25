/**
 * Player-placed civic buildings: utilities now (M4), services, parks and landmarks later.
 * Footprints are in metres (w along the road, d away from it). DESIGN.md §3.6–3.7.
 */
import type { Dept } from './economy';

export type Utility = 'power' | 'water' | 'sewage';
export type ServiceKind = 'fire' | 'police' | 'health' | 'education' | 'park';
export const SERVICE_KINDS: ServiceKind[] = ['fire', 'police', 'health', 'education', 'park'];
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
  /** Bus depot (M6): buses it runs and passengers per bus. */
  transit?: { buses: number; capacity: number };
  /** Service coverage and capacity (M5). */
  service?: {
    kind: ServiceKind;
    range: number;
    vehicles?: number;
    capacity?: number;
    level?: number;
    vehicle?: 'fire' | 'police' | 'ambulance';
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
    garbage: { trucks: 4, truckCapacity: 90, storage: 80_000 },
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
    garbage: { trucks: 3, truckCapacity: 90, process: 900, revenuePerUnit: 0.8 },
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
    garbage: { trucks: 3, truckCapacity: 90, process: 1_400, powerPerUnit: 0.25 },
    airPollution: 0.6,
    landValue: { radius: 160, value: -0.12 },
    blurb: 'Burns garbage for a little power, and some smoke.',
    unlockPopulation: 6_000,
    model: 'incinerator',
  },
  // Safety
  {
    id: 'firestation',
    name: 'Fire station',
    category: 'fire',
    dept: 'fire',
    w: 24,
    d: 24,
    cost: 11_000,
    upkeep: 360,
    service: { kind: 'fire', range: 55, vehicles: 3, vehicle: 'fire' },
    blurb: 'Fire engines race to fires along the roads. Covers what it can reach quickly.',
    unlockPopulation: 0,
    model: 'firestation',
  },
  {
    id: 'police',
    name: 'Police station',
    category: 'police',
    dept: 'police',
    w: 24,
    d: 24,
    cost: 11_000,
    upkeep: 360,
    service: { kind: 'police', range: 60, vehicles: 3, vehicle: 'police' },
    blurb: 'Patrol cars answer crimes. Coverage deters crime nearby.',
    unlockPopulation: 0,
    model: 'police',
  },
  // Health
  {
    id: 'clinic',
    name: 'Clinic',
    category: 'health',
    dept: 'health',
    w: 20,
    d: 20,
    cost: 8_000,
    upkeep: 300,
    service: { kind: 'health', range: 45, vehicles: 1, capacity: 40, vehicle: 'ambulance' },
    blurb: 'Treats the sick nearby and runs an ambulance.',
    unlockPopulation: 0,
    model: 'clinic',
  },
  {
    id: 'hospital',
    name: 'Hospital',
    category: 'health',
    dept: 'health',
    w: 40,
    d: 40,
    cost: 38_000,
    upkeep: 1_100,
    service: { kind: 'health', range: 100, vehicles: 4, capacity: 300, vehicle: 'ambulance' },
    blurb: 'Many beds and ambulances; covers a large area.',
    unlockPopulation: 4_000,
    model: 'hospital',
  },
  // Education
  {
    id: 'primary',
    name: 'Primary school',
    category: 'education',
    dept: 'education',
    w: 32,
    d: 24,
    cost: 10_000,
    upkeep: 340,
    service: { kind: 'education', range: 45, capacity: 300, level: 1 },
    blurb: 'Seats for the children of nearby homes.',
    unlockPopulation: 0,
    model: 'primary',
  },
  {
    id: 'highschool',
    name: 'High school',
    category: 'education',
    dept: 'education',
    w: 40,
    d: 32,
    cost: 26_000,
    upkeep: 760,
    service: { kind: 'education', range: 80, capacity: 700, level: 2 },
    blurb: 'Teenagers from a wide area study here.',
    unlockPopulation: 2_500,
    model: 'highschool',
  },
  {
    id: 'university',
    name: 'University',
    category: 'education',
    dept: 'education',
    w: 64,
    d: 48,
    cost: 90_000,
    upkeep: 2_300,
    service: { kind: 'education', range: 240, capacity: 2_000, level: 3 },
    blurb: 'Higher education for the whole city; educated workers attract high-tech industry.',
    unlockPopulation: 15_000,
    model: 'university',
  },
  {
    id: 'library',
    name: 'Library',
    category: 'education',
    dept: 'education',
    w: 20,
    d: 20,
    cost: 7_000,
    upkeep: 180,
    service: { kind: 'education', range: 50, capacity: 200, level: 1 },
    landValue: { radius: 120, value: 0.06 },
    blurb: 'Lifelong learning; a small boost to education and land value.',
    unlockPopulation: 1_500,
    model: 'library',
  },
  // Parks
  {
    id: 'park_small',
    name: 'Pocket park',
    category: 'parks',
    dept: 'parks',
    w: 16,
    d: 16,
    cost: 1_500,
    upkeep: 40,
    service: { kind: 'park', range: 16 },
    landValue: { radius: 110, value: 0.12 },
    blurb: 'Trees, benches and a lawn. Lifts moods and land value nearby.',
    unlockPopulation: 0,
    model: 'park_small',
  },
  {
    id: 'plaza',
    name: 'Plaza',
    category: 'parks',
    dept: 'parks',
    w: 24,
    d: 24,
    cost: 4_000,
    upkeep: 90,
    service: { kind: 'park', range: 20 },
    landValue: { radius: 140, value: 0.14 },
    blurb: 'A paved square with a fountain; especially loved by shops nearby.',
    unlockPopulation: 600,
    model: 'plaza',
  },
  {
    id: 'park_large',
    name: 'City park',
    category: 'parks',
    dept: 'parks',
    w: 48,
    d: 48,
    cost: 12_000,
    upkeep: 220,
    service: { kind: 'park', range: 32 },
    landValue: { radius: 240, value: 0.2 },
    blurb: 'A big green space with a pond and paths. Absorbs pollution too.',
    unlockPopulation: 2_000,
    model: 'park_large',
  },
];

CIVIC_DEFS.push({
  id: 'busdepot',
  name: 'Bus depot',
  category: 'transit',
  dept: 'transit',
  w: 32,
  d: 28,
  cost: 16_000,
  upkeep: 520,
  transit: { buses: 6, capacity: 50 },
  blurb: 'Runs buses round the bus stops you place, in one loop. Riders leave their cars at home.',
  unlockPopulation: 800,
  model: 'busdepot',
});

export const CIVIC = new Map(CIVIC_DEFS.map((d) => [d.id, d]));

/** Incident and service tuning (in ticks; see DESIGN §3.7 on vehicle time). */
export const SERVICES = {
  /** Coverage is full within this share of the range, fading to zero at the range. */
  fullShare: 0.5,
  /** Fires per building per hour with no coverage (×4 for abandoned, ×1.5 for industry). */
  fireBase: 0.00012,
  fireCoverageCut: 0.75,
  /** Intensity growth per tick and ticks at full intensity before collapse. */
  fireGrowth: 0.004,
  fireDestroyTicks: 450,
  /** Every `fireSpreadEvery` ticks a strong fire may jump to buildings within `fireSpreadRange` m. */
  fireSpreadEvery: 30,
  fireSpreadRange: 14,
  fireSpreadChance: 0.02,
  /** Intensity removed per tick by one engine on site (× funding). */
  extinguishRate: 0.012,
  /** Crimes per building per hour at the base rate. */
  crimeBase: 0.0015,
  crimePoliceCut: 0.8,
  /** Ticks before an unanswered crime happens. */
  crimeWindow: 420,
  /** Emergencies per resident per hour. */
  emergencyRate: 0.00004,
  emergencyWindow: 600,
  /** Share of new pollution-driven sickness cases that need an ambulance. */
  emergencyPerCase: 0.15,
  /** Rubble is cleared automatically after this many hours. */
  rubbleClearHours: 36,
};

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
