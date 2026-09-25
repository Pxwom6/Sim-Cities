import { GRID_CELL, GRID_RES } from '../../data/world';
import { ZONE_I } from '../../data/zones';
import type { Sim } from '../sim';
import { BState } from '../world/buildings';
import { civicDef } from '../world/civic';

/**
 * Ground pollution raster (DESIGN §3.11). M4: industry, sewage outflows, landfills and unserved
 * sewage; slow spread and decay. Air pollution with wind drift joins in M7.
 */
/** Crime fades over time. */
export function decayCrime(sim: Sim, hours: number): void {
  const f = sim.state.crime;
  const k = Math.pow(0.97, hours);
  for (let i = 0; i < f.length; i++) f[i] = f[i]! < 0.001 ? 0 : f[i]! * k;
}

export function splatField(
  field: Float32Array,
  x: number,
  z: number,
  amount: number,
  radiusCells: number,
): void {
  splat(field, x, z, amount, radiusCells);
}

function splat(field: Float32Array, x: number, z: number, amount: number, radiusCells: number): void {
  const ci = Math.floor(x / GRID_CELL);
  const cj = Math.floor(z / GRID_CELL);
  const r = Math.max(1, Math.ceil(radiusCells));
  let wsum = 0;
  const cells: [number, number][] = [];
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= GRID_RES || j >= GRID_RES) continue;
      const d2 = (di * di + dj * dj) / (radiusCells * radiusCells);
      if (d2 > 1) continue;
      const w = 1 - d2;
      cells.push([j * GRID_RES + i, w]);
      wsum += w;
    }
  }
  for (const [k, w] of cells) field[k] = field[k]! + (amount * w) / wsum;
}

export function updateGroundPollution(sim: Sim, hours: number): void {
  const s = sim.state;
  const field = s.groundPollution;
  const add = new Float32Array(field.length);
  for (const b of s.buildings.values()) {
    if (b.state !== BState.Active) continue;
    if (b.zone === ZONE_I && b.wealth === 0) splat(add, b.x, b.z, 0.012 * b.w * b.d * hours, 3);
    if (b.sewage < 0.99) splat(add, b.x, b.z, 0.01 * (1 - b.sewage) * b.w * b.d * hours, 2);
  }
  for (const c of s.civics.values()) {
    const def = civicDef(c);
    if (def.groundPollution) {
      const radius = def.pollutionRadius ?? (def.w + 80) / 2;
      const area = (radius / 60) ** 2;
      splat(add, c.x, c.z, def.groundPollution * 0.8 * area * hours, radius / GRID_CELL);
    }
  }
  // Slow spread, decay, sources; clamp to [0, 1].
  const out = new Float32Array(field.length);
  const decay = Math.pow(0.994, hours);
  for (let j = 0; j < GRID_RES; j++) {
    for (let i = 0; i < GRID_RES; i++) {
      const k = j * GRID_RES + i;
      let nb = 0;
      let cnt = 0;
      if (i > 0) {
        nb += field[k - 1]!;
        cnt++;
      }
      if (i < GRID_RES - 1) {
        nb += field[k + 1]!;
        cnt++;
      }
      if (j > 0) {
        nb += field[k - GRID_RES]!;
        cnt++;
      }
      if (j < GRID_RES - 1) {
        nb += field[k + GRID_RES]!;
        cnt++;
      }
      const v = field[k]! * 0.96 + (cnt ? (nb / cnt) * 0.04 : 0);
      out[k] = Math.max(0, Math.min(1, v * decay + add[k]!));
    }
  }
  field.set(out);
}

export function fieldAt(field: Float32Array, x: number, z: number): number {
  const i = Math.min(GRID_RES - 1, Math.max(0, Math.floor(x / GRID_CELL)));
  const j = Math.min(GRID_RES - 1, Math.max(0, Math.floor(z / GRID_CELL)));
  return field[j * GRID_RES + i]!;
}
