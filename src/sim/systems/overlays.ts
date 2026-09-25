import { GRID_CELL, GRID_RES } from '../../data/world';
import type { Sim } from '../sim';
import { BState, footprint } from '../world/buildings';
import { civicOutput } from './utilities';

/** Data maps (DESIGN §4): values in [0, 1] per raster cell, −1 where there is nothing to show. */
export type OverlayMap =
  'power' | 'water' | 'sewage' | 'garbage' | 'groundwater' | 'groundPollution' | 'landValue' | 'resources';

export interface OverlayResult {
  map: OverlayMap;
  values: Float32Array;
  /** 'diverging' = bad (0) … good (1); 'sequential' = none (0) … lots (1). */
  ramp: 'diverging' | 'sequential';
  legend: [string, string];
}

function stampBuildings(
  sim: Sim,
  out: Float32Array,
  value: (b: import('../world/buildings').Building) => number | null,
): void {
  for (const b of sim.state.buildings.values()) {
    const v = value(b);
    if (v === null) continue;
    const r = footprint(b);
    const c = Math.cos(r.angle);
    const s = Math.sin(r.angle);
    for (let u = -r.hw + 4; u <= r.hw; u += 8) {
      for (let w = -r.hd + 4; w <= r.hd; w += 8) {
        const x = b.x + u * c - w * s;
        const z = b.z + u * s + w * c;
        const i = Math.floor(x / GRID_CELL);
        const j = Math.floor(z / GRID_CELL);
        if (i < 0 || j < 0 || i >= GRID_RES || j >= GRID_RES) continue;
        const k = j * GRID_RES + i;
        out[k] = out[k]! < 0 ? v : Math.min(out[k]!, v);
      }
    }
  }
}

function stampRoads(sim: Sim, out: Float32Array, value: (seg: number) => number | null): void {
  for (const seg of sim.state.net.segments.values()) {
    const v = value(seg.id);
    if (v === null) continue;
    const c = sim.net.curve(seg.id);
    for (let s = 0; s <= c.length; s += 6) {
      const p = c.pointAt(s);
      const i = Math.floor(p.x / GRID_CELL);
      const j = Math.floor(p.z / GRID_CELL);
      if (i < 0 || j < 0 || i >= GRID_RES || j >= GRID_RES) continue;
      const k = j * GRID_RES + i;
      if (out[k]! < 0) out[k] = v;
    }
  }
}

export function computeOverlay(sim: Sim, map: OverlayMap): OverlayResult {
  const n = GRID_RES * GRID_RES;
  const values = new Float32Array(n).fill(-1);
  const s = sim.state;
  switch (map) {
    case 'power':
    case 'water':
    case 'sewage': {
      stampBuildings(sim, values, (b) => (b.state === BState.Active ? b[map] : null));
      // Roads carry supply where a producer shares their network.
      const g = sim.graph();
      const supplied = new Set<number>();
      for (const c of s.civics.values()) {
        if (!c.access || civicOutput(sim, c, map) <= 0) continue;
        const seg = s.net.segments.get(c.access.seg);
        if (seg) supplied.add(g.componentOfNode(seg.a));
      }
      stampRoads(sim, values, (id) => {
        const seg = s.net.segments.get(id)!;
        if (seg.type === 'highway') return null;
        return supplied.has(g.componentOfNode(seg.a)) ? 1 : 0;
      });
      return {
        map,
        values,
        ramp: 'diverging',
        legend: map === 'sewage' ? ['Sewage backing up', 'Drained'] : ['No supply', 'Supplied'],
      };
    }
    case 'garbage':
      stampBuildings(sim, values, (b) => (b.state === BState.Active ? Math.min(1, b.garbage / 60) : null));
      return { map, values, ramp: 'sequential', legend: ['Clean', 'Piling up'] };
    case 'groundwater':
    case 'resources':
      for (let k = 0; k < n; k++) {
        const v =
          map === 'groundwater'
            ? sim.terrain.groundwater[k]! / 255
            : Math.max(sim.terrain.ore[k]!, sim.terrain.oil[k]!) / 255;
        values[k] = v > 0.02 ? v : -1;
      }
      return {
        map,
        values,
        ramp: 'sequential',
        legend: map === 'groundwater' ? ['Dry', 'Plenty of water'] : ['None', 'Rich deposits'],
      };
    case 'groundPollution':
      for (let k = 0; k < n; k++)
        values[k] = s.groundPollution[k]! > 0.01 ? Math.min(1, s.groundPollution[k]!) : -1;
      return { map, values, ramp: 'sequential', legend: ['Clean', 'Polluted'] };
    case 'landValue':
      for (let k = 0; k < n; k++) values[k] = s.landValue[k]!;
      return { map, values, ramp: 'sequential', legend: ['Low', 'High'] };
  }
}
