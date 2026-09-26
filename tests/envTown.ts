import type { Sim } from '../src/sim/sim';
import type { Vec2 } from '../src/sim/geom';
import { connectPoint, placeAlong, road } from './helpers';

/**
 * A residential street running along the prevailing wind with two coal plants half way down it:
 * homes at one end are upwind of the plants, homes at the other end downwind. The map seed's wind
 * blows towards +z (south), so the street runs north–south. Returns the plants and the street.
 */
export function windStreet(sim: Sim): { plants: number[]; street: number[]; mid: Vec2 } {
  sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
  sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 300_000 });
  const c = connectPoint(sim);
  const x = c.x + 200;
  road(sim, [c, { x, z: c.z }], 'avenue');
  const street = road(
    sim,
    [
      { x, z: c.z - 250 },
      { x, z: c.z + 190 },
    ],
    'street',
  ).created!;
  // A parallel street for the plants and utilities, linked at both ends.
  const x2 = x + 150;
  road(
    sim,
    [
      { x: x2, z: c.z - 250 },
      { x: x2, z: c.z + 190 },
    ],
    'street',
  );
  road(
    sim,
    [
      { x, z: c.z - 250 },
      { x: x2, z: c.z - 250 },
    ],
    'street',
  );
  road(
    sim,
    [
      { x, z: c.z + 190 },
      { x: x2, z: c.z + 190 },
    ],
    'street',
  );
  const zone = (a: Vec2, b: Vec2, r: number) =>
    sim.dispatch({ type: 'zone', zone: 'R', area: { kind: 'brush', points: [a, b], radius: r } });
  zone({ x: x - 40, z: c.z - 240 }, { x: x - 40, z: c.z + 180 }, 36);
  zone({ x: x + 40, z: c.z - 240 }, { x: x + 40, z: c.z + 180 }, 36);
  const segsOn = (xx: number) =>
    [...sim.state.net.segments.values()]
      .filter((sg) => {
        const p = sim.net.curve(sg.id).pointAt(sim.net.curve(sg.id).length / 2);
        return Math.abs(p.x - xx) < 1;
      })
      .map((sg) => sg.id)
      .sort((a, b) => Math.abs(midZ(sim, a) - c.z) - Math.abs(midZ(sim, b) - c.z));
  // Two coal plants beside the homes' street, level with its middle; water upwind on the
  // second street, sewage and garbage at its far end.
  const plants: number[] = [];
  for (const def of ['coal', 'coal']) plants.push(placeNear(sim, def, segsOn(x), c.z - 20));
  for (const def of ['pump', 'pump', 'pump']) placeNear(sim, def, segsOn(x2), c.z - 230);
  for (const def of ['treatment', 'landfill']) placeNear(sim, def, segsOn(x2), c.z + 180);
  for (const def of ['firestation', 'police', 'primary']) placeNear(sim, def, segsOn(x2), c.z - 60);
  placeNear(sim, 'clinic', segsOn(x2), c.z + 120);
  // Jobs: commerce along the avenue, industry away to the west.
  sim.dispatch({
    type: 'zone',
    zone: 'C',
    area: {
      kind: 'brush',
      points: [
        { x: c.x + 30, z: c.z + 20 },
        { x: x - 20, z: c.z + 20 },
      ],
      radius: 20,
    },
  });
  sim.dispatch({
    type: 'zone',
    zone: 'C',
    area: {
      kind: 'brush',
      points: [
        { x: c.x + 30, z: c.z - 20 },
        { x: x - 20, z: c.z - 20 },
      ],
      radius: 20,
    },
  });
  return { plants, street, mid: { x, z: c.z } };
}

function midZ(sim: Sim, id: number): number {
  const cv = sim.net.curve(id);
  return cv.pointAt(cv.length / 2).z;
}

function placeNear(sim: Sim, def: string, segs: number[], z: number): number {
  const ordered = [...segs].sort((a, b) => Math.abs(midZ(sim, a) - z) - Math.abs(midZ(sim, b) - z));
  for (const id of ordered) {
    try {
      return placeAlong(sim, def, id);
    } catch {
      /* next */
    }
  }
  throw new Error(`no room for ${def}`);
}
