import type { Sim } from '../src/sim/sim';
import type { Vec2 } from '../src/sim/geom';
import { GRID_CELL, GRID_RES } from '../src/data/world';
import { connectPoint, placeAlong, road } from './helpers';

/**
 * A lakeside neighbourhood for flood scenarios (seed 'b', lakes preset): an avenue from the highway
 * down towards the nearest shore, a street along the shore, homes on both, and the utilities up the
 * avenue on higher ground. Returns a point by the water to flood from.
 */
export function lakeTown(sim: Sim): { shore: Vec2; avenue: number[]; street: number[] } {
  sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
  sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 400_000 });
  const c = connectPoint(sim);
  const wd = sim.waterDist();
  let best = { d: 1e9, x: 0, z: 0 };
  for (let j = 0; j < GRID_RES; j++)
    for (let i = 0; i < GRID_RES; i++) {
      if (wd[j * GRID_RES + i]! > 0) continue;
      const x = (i + 0.5) * GRID_CELL;
      const z = (j + 0.5) * GRID_CELL;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < best.d) best = { d, x, z };
    }
  const ux = (best.x - c.x) / best.d;
  const uz = (best.z - c.z) / best.d;
  const end = { x: c.x + ux * (best.d - 80), z: c.z + uz * (best.d - 80) };
  const avenue = road(sim, [c, end], 'avenue').created!;
  // A street across the end of the avenue, running along the shore.
  let street: number[] = [];
  for (const half of [150, 120, 90, 60]) {
    const a = { x: end.x - uz * half, z: end.z + ux * half };
    const b = { x: end.x + uz * half, z: end.z - ux * half };
    const r = sim.dispatch({ type: 'buildRoad', road: 'street', points: [a, b] });
    if (r.ok) {
      street = r.created!;
      break;
    }
  }
  if (!street.length) throw new Error('no room for the shore street');
  // Homes along the last stretch of the avenue and the shore street.
  const mid = { x: c.x + ux * (best.d - 260), z: c.z + uz * (best.d - 260) };
  sim.dispatch({ type: 'zone', zone: 'R', area: { kind: 'brush', points: [mid, end], radius: 40 } });
  for (const seg of street) sim.dispatch({ type: 'zone', zone: 'R', area: { kind: 'segment', id: seg } });
  // Utilities up the avenue, well away from the water.
  const up = avenue[0]!;
  for (const def of ['coal', 'pump', 'pump', 'treatment', 'landfill']) placeAlong(sim, def, up);
  return { shore: end, avenue, street };
}
