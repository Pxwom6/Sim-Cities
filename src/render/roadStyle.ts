import { Color } from 'three';
import { ROAD_TYPES, type RoadTypeId } from '../data/roads';

export interface Strip {
  from: number;
  to: number;
  lift: number;
  color: Color;
}
export interface Marking {
  offset: number;
  width: number;
  dash: number;
  gap: number;
  color: Color;
}
export interface RoadStyle {
  strips: Strip[];
  markings: Marking[];
  /** Offsets where a vertical kerb face joins two strips of different lift. */
  kerbs: { at: number; low: number; high: number }[];
  asphaltHalf: number;
  totalHalf: number;
  asphalt: Color;
  sidewalk: Color;
  lift: number;
  sidewalkLift: number;
}

const ASPHALT = new Color('#767b82');
const HIGHWAY_ASPHALT = new Color('#6c7178');
const SIDEWALK = new Color('#cfc9bd');
const DIRT = new Color('#b59a6d');
const VERGE = new Color('#9aa36a');
const MEDIAN = new Color('#7da65c');
const YELLOW = new Color('#f1cf63');
const WHITE = new Color('#f4f2ea');

const L = 0.2; // asphalt lift above the terrain
const S = 0.34; // sidewalk lift

function build(id: RoadTypeId): RoadStyle {
  const t = ROAD_TYPES[id];
  const hw = t.width / 2;
  const tot = hw + t.sidewalk;
  const strips: Strip[] = [];
  const markings: Marking[] = [];
  const kerbs: RoadStyle['kerbs'] = [];
  if (id === 'dirt') {
    strips.push({ from: -tot, to: -hw, lift: L - 0.02, color: VERGE });
    strips.push({ from: -hw, to: hw, lift: L, color: DIRT });
    strips.push({ from: hw, to: tot, lift: L - 0.02, color: VERGE });
    return {
      strips,
      markings,
      kerbs,
      asphaltHalf: hw,
      totalHalf: tot,
      asphalt: DIRT,
      sidewalk: VERGE,
      lift: L,
      sidewalkLift: L - 0.02,
    };
  }
  const asphalt = id === 'highway' ? HIGHWAY_ASPHALT : ASPHALT;
  strips.push({ from: -tot, to: -hw, lift: S, color: SIDEWALK });
  strips.push({ from: hw, to: tot, lift: S, color: SIDEWALK });
  kerbs.push({ at: -hw, low: L, high: S }, { at: hw, low: L, high: S });
  if (id === 'street') {
    strips.push({ from: -hw, to: hw, lift: L, color: asphalt });
    markings.push({ offset: 0, width: 0.22, dash: 3, gap: 4, color: YELLOW });
  } else {
    const med = id === 'avenue' ? 1 : id === 'boulevard' ? 1.5 : 0.6;
    strips.push({ from: -hw, to: -med, lift: L, color: asphalt });
    strips.push({ from: med, to: hw, lift: L, color: asphalt });
    strips.push({
      from: -med,
      to: med,
      lift: id === 'highway' ? L + 0.5 : S,
      color: id === 'highway' ? SIDEWALK : MEDIAN,
    });
    kerbs.push(
      { at: -med, low: L, high: id === 'highway' ? L + 0.5 : S },
      { at: med, low: L, high: id === 'highway' ? L + 0.5 : S },
    );
    const lanesPerSide = t.lanes / 2;
    const laneW = (hw - med) / lanesPerSide;
    for (let k = 1; k < lanesPerSide; k++) {
      const o = med + laneW * k;
      markings.push({ offset: o, width: 0.18, dash: 3, gap: 6, color: WHITE });
      markings.push({ offset: -o, width: 0.18, dash: 3, gap: 6, color: WHITE });
    }
    markings.push({ offset: hw - 0.5, width: 0.15, dash: 1000, gap: 0, color: WHITE });
    markings.push({ offset: -hw + 0.5, width: 0.15, dash: 1000, gap: 0, color: WHITE });
  }
  return {
    strips,
    markings,
    kerbs,
    asphaltHalf: hw,
    totalHalf: tot,
    asphalt,
    sidewalk: SIDEWALK,
    lift: L,
    sidewalkLift: S,
  };
}

export const ROAD_STYLES: Record<RoadTypeId, RoadStyle> = {
  dirt: build('dirt'),
  street: build('street'),
  avenue: build('avenue'),
  boulevard: build('boulevard'),
  highway: build('highway'),
};
