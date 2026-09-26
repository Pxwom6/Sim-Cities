/**
 * Add-on modules for service buildings (M10): each raises one capacity of the building it's added
 * to, for a one-off cost and extra upkeep. A building takes each of its modules once, or up to
 * `max` times (garbage trucks).
 */
export interface ModuleDef {
  id: string;
  name: string;
  /** Civic building types it can be added to. */
  for: string[];
  cost: number;
  /** Extra monthly upkeep (charged to the building's department). */
  upkeep: number;
  /** Extra vehicles (engines, patrol cars, ambulances), seats or beds, or buses. */
  vehicles?: number;
  capacity?: number;
  buses?: number;
  /** Extra garbage trucks. */
  trucks?: number;
  /** How many a building can take (default 1). */
  max?: number;
  unlockPopulation: number;
  blurb: string;
}

export const MODULES: ModuleDef[] = [
  {
    id: 'garbageTruck',
    name: 'Extra truck',
    for: ['landfill', 'recycling', 'incinerator'],
    cost: 1_200,
    upkeep: 45,
    trucks: 1,
    max: 4,
    unlockPopulation: 0,
    blurb: 'One more garbage truck, bought one at a time.',
  },
  {
    id: 'engineBay',
    name: 'Extra engine bay',
    for: ['firestation'],
    cost: 4_000,
    upkeep: 140,
    vehicles: 2,
    unlockPopulation: 2_000,
    blurb: 'Two more fire engines.',
  },
  {
    id: 'patrolWing',
    name: 'Patrol wing',
    for: ['police'],
    cost: 4_000,
    upkeep: 140,
    vehicles: 2,
    unlockPopulation: 2_000,
    blurb: 'Two more patrol cars.',
  },
  {
    id: 'ambulanceBay',
    name: 'Ambulance bay',
    for: ['clinic', 'hospital'],
    cost: 5_000,
    upkeep: 160,
    vehicles: 2,
    unlockPopulation: 2_000,
    blurb: 'Two more ambulances.',
  },
  {
    id: 'ward',
    name: 'New ward',
    for: ['clinic', 'hospital'],
    cost: 9_000,
    upkeep: 260,
    capacity: 60,
    unlockPopulation: 5_000,
    blurb: '60 more beds.',
  },
  {
    id: 'classrooms',
    name: 'Extra classrooms',
    for: ['primary', 'highschool'],
    cost: 6_000,
    upkeep: 200,
    capacity: 150,
    unlockPopulation: 2_000,
    blurb: '150 more pupils.',
  },
  {
    id: 'lectureHall',
    name: 'Lecture hall',
    for: ['university'],
    cost: 20_000,
    upkeep: 500,
    capacity: 600,
    unlockPopulation: 20_000,
    blurb: '600 more students.',
  },
  {
    id: 'busBay',
    name: 'Extra bus bay',
    for: ['busdepot'],
    cost: 6_000,
    upkeep: 240,
    buses: 4,
    unlockPopulation: 5_000,
    blurb: 'Four more buses on the loop.',
  },
];

export const MODULE = new Map(MODULES.map((m) => [m.id, m]));

/** Modules that can go on a civic building type. */
export function modulesFor(def: string): ModuleDef[] {
  return MODULES.filter((m) => m.for.includes(def));
}
