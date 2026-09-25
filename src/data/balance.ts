/** Balancing constants for demand, growth, occupancy and happiness. DESIGN.md §3.3–3.10. */
export const DEMAND = {
  workforceShare: 0.5,
  /** R: open jobs pull residents in; unemployment pushes them away. */
  jobsWeight: 1.5,
  jobsSoftening: 100,
  /** R: settlers arriving from the highway while the town is tiny. */
  newcomers: 0.6,
  newcomersFadePopulation: 400,
  /** R: approval above/below this pulls demand up/down. */
  appealNeutral: 0.55,
  appealWeight: 0.8,
  /** C: commercial jobs wanted per resident (shoppers). */
  shopJobsPerResident: 0.12,
  shoppersWeight: 1.2,
  cWorkforceWeight: 0.6,
  /** I: unemployed workers attract industry. */
  iWorkforceWeight: 1.5,
  /** I: regional demand for goods while connected to the highway. */
  exports: 0.25,
  /** Demand change per tax point above the neutral rate. */
  taxPerPoint: -0.04,
  neutralTax: 9,
  /** Demand values are eased towards their targets each hour. */
  easing: 0.35,
};

export const GROWTH = {
  /** Ticks between growth passes. */
  passInterval: 10,
  /** Blocks examined per pass. */
  blocksPerPass: 60,
  /** Spawn chance per candidate lot per pass at demand 1. */
  spawnChance: 0.25,
  baseConstructions: 6,
  constructionsPerPopulation: 1 / 150,
  /** Max share of capacity that moves in / out per pass. */
  moveIn: 0.1,
  moveOut: 0.05,
  /** Residents only move in while R demand is above this. */
  moveInMinDemand: -0.2,
  /** Upgrade: needs this happiness and occupancy for `upgradeChecks` hourly checks. */
  upgradeHappiness: 0.62,
  upgradeOccupancy: 0.88,
  upgradeChecks: 3,
  upgradeChance: 0.25,
  /** Decline: distress per hour while unhappy; abandoned at `abandonAt`. */
  distressHappiness: 0.3,
  abandonAt: 48,
  recoverRate: 2,
  /** Abandoned buildings re-occupy after this many hours of good conditions. */
  reoccupyHours: 24,
  reoccupyHappiness: 0.5,
  /** Max angle difference (radians) between adjacent columns of one lot. */
  maxLotBend: 0.1,
  /** Max terrain height range across a lot, metres. */
  maxLotRise: 3.5,
};

export const COMMUTE = {
  /** Longest commute anyone accepts, seconds of travel. */
  maxCommute: 1800,
  /** Longest trip to the shops, seconds. */
  maxShopTrip: 900,
  /** Customers per commercial job per day. */
  customersPerJob: 10,
  /** Seconds a building is from its road node (walk + parking). */
  accessSeconds: 30,
};

export const HAPPINESS = {
  base: 0.55,
  unemployment: -0.15,
  commuteGood: 0.06,
  commuteGoodSeconds: 480,
  commuteBad: -0.12,
  commuteBadSeconds: 1500,
  shopsGood: 0.04,
  shopsBad: -0.06,
  taxPerPoint: -0.015,
  taxSensitivity: [1.4, 1.0, 0.8],
  noHighwayAccess: -0.4,
  /** Businesses. */
  customersGood: 0.08,
  customersBad: -0.15,
  workersBad: -0.2,
  staffedGood: 0.06,
  landValue: 0.1,
};
