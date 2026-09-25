/** Road types and road-building rules. DESIGN.md §2, SPEC §5 Roads. */
export type RoadTypeId = 'dirt' | 'street' | 'avenue' | 'boulevard' | 'highway';

export interface RoadType {
  id: RoadTypeId;
  name: string;
  /** Carriageway width in metres (kerb to kerb). */
  width: number;
  /** Sidewalk / verge width on each side. */
  sidewalk: number;
  lanes: number;
  /** Free-flow speed, km/h. */
  speed: number;
  /** Capacity, vehicles per hour (both directions). */
  capacity: number;
  costPerMetre: number;
  /** Maintenance per metre per month. */
  upkeepPerMetre: number;
  /** Highest zone density that can grow along it: 0 low, 1 medium, 2 high. */
  maxDensity: 0 | 1 | 2;
  /** Population needed to unlock. */
  unlockPopulation: number;
  buildable: boolean;
  blurb: string;
}

export const ROAD_TYPES: Record<RoadTypeId, RoadType> = {
  dirt: {
    id: 'dirt',
    name: 'Dirt road',
    width: 6,
    sidewalk: 1,
    lanes: 2,
    speed: 30,
    capacity: 400,
    costPerMetre: 4,
    upkeepPerMetre: 0.02,
    maxDensity: 0,
    unlockPopulation: 0,
    buildable: true,
    blurb: 'Cheap and slow. Only low-density buildings grow along it.',
  },
  street: {
    id: 'street',
    name: 'Street',
    width: 8,
    sidewalk: 2,
    lanes: 2,
    speed: 40,
    capacity: 900,
    costPerMetre: 10,
    upkeepPerMetre: 0.05,
    maxDensity: 1,
    unlockPopulation: 0,
    buildable: true,
    blurb: 'Two lanes with sidewalks. Supports up to medium density.',
  },
  avenue: {
    id: 'avenue',
    name: 'Avenue',
    width: 16,
    sidewalk: 2.5,
    lanes: 4,
    speed: 50,
    capacity: 2400,
    costPerMetre: 26,
    upkeepPerMetre: 0.12,
    maxDensity: 2,
    unlockPopulation: 0,
    buildable: true,
    blurb: 'Four lanes and a planted median. Carries heavy traffic; allows high density.',
  },
  boulevard: {
    id: 'boulevard',
    name: 'Boulevard',
    width: 22,
    sidewalk: 3,
    lanes: 6,
    speed: 60,
    capacity: 3800,
    costPerMetre: 48,
    upkeepPerMetre: 0.2,
    maxDensity: 2,
    unlockPopulation: 20_000,
    buildable: true,
    blurb: 'Six lanes for a growing metropolis. Highest capacity on the map.',
  },
  highway: {
    id: 'highway',
    name: 'Regional highway',
    width: 20,
    sidewalk: 2,
    lanes: 4,
    speed: 80,
    capacity: 6000,
    costPerMetre: 0,
    upkeepPerMetre: 0,
    maxDensity: 0,
    unlockPopulation: 0,
    buildable: false,
    blurb: 'Connects the city to the region.',
  },
};

export const BUILDABLE_ROADS: RoadTypeId[] = ['dirt', 'street', 'avenue', 'boulevard'];

/** Half the corridor a road occupies (carriageway + sidewalks). */
export const roadHalfWidth = (t: RoadTypeId): number => ROAD_TYPES[t].width / 2 + ROAD_TYPES[t].sidewalk;

export const ROAD_RULES = {
  /** Shortest segment that may be built. */
  minLength: 12,
  /** Longest single segment (longer paths are split automatically). */
  maxSegmentLength: 400,
  /** Steepest grade allowed (rise over run), measured over GRADE_WINDOW metres. */
  maxGrade: 0.12,
  gradeWindow: 16,
  /** Minimum angle between roads meeting at a node or crossing. */
  minAngleDeg: 28,
  /** Minimum turning radius of a curve, metres. */
  minRadius: 18,
  /** Endpoints this close to an existing node reuse it. */
  nodeTolerance: 1.0,
  /** Endpoints this close to a segment split it. */
  segmentTolerance: 1.0,
  /** Extra clearance between the corridors of unconnected roads. */
  clearance: 2,
  /** Share of the build cost refunded when bulldozing. */
  bulldozeRefund: 0.25,
};

/** Client-side snapping radii (input convenience; the sim still validates). */
export const SNAP = {
  node: 10,
  segment: 8,
  angleDeg: 5,
  grid: 8,
};
