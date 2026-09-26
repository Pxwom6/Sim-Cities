import type { Sim } from '../src/sim/sim';
import type { Vec2 } from '../src/sim/geom';
import { connectPoint, placeAlong, road } from './helpers';

/**
 * Two districts joined by one narrow link: homes west of it, jobs east of it. Everyone commutes
 * through the link, which is where the jam should form. Returns the link's segment id and a
 * function that builds a parallel avenue (the bypass).
 */
export function twoDistricts(
  sim: Sim,
  link: 'dirt' | 'street' = 'dirt',
): { link: number; bypass: () => number[]; buses: () => number[]; c: Vec2 } {
  sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
  sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 400_000 });
  const c = connectPoint(sim);
  const z = c.z;
  const west = road(sim, [c, { x: c.x + 230, z }], 'avenue').created!;
  const linkIds = road(
    sim,
    [
      { x: c.x + 230, z },
      { x: c.x + 350, z },
    ],
    link,
  ).created!;
  road(
    sim,
    [
      { x: c.x + 350, z },
      { x: c.x + 570, z },
    ],
    'avenue',
  );
  // West: residential streets. East: commercial and industrial streets.
  for (const x of [70, 130, 190])
    road(
      sim,
      [
        { x: c.x + x, z: z - 170 },
        { x: c.x + x, z: z + 170 },
      ],
      'street',
    );
  for (const x of [410, 470, 530])
    road(
      sim,
      [
        { x: c.x + x, z: z - 230 },
        { x: c.x + x, z },
      ],
      'street',
    );
  const brush = (zone: 'R' | 'C' | 'I', a: Vec2, b: Vec2, radius: number) =>
    sim.dispatch({ type: 'zone', zone, area: { kind: 'brush', points: [a, b], radius } });
  brush('R', { x: c.x + 30, z: z - 95 }, { x: c.x + 220, z: z - 95 }, 75);
  brush('R', { x: c.x + 30, z: z + 95 }, { x: c.x + 220, z: z + 95 }, 75);
  brush('C', { x: c.x + 370, z: z - 50 }, { x: c.x + 560, z: z - 50 }, 40);
  brush('I', { x: c.x + 370, z: z - 165 }, { x: c.x + 560, z: z - 165 }, 70);
  // Utilities on a street north of the homes; services on the district streets.
  const util = road(
    sim,
    [
      { x: c.x + 20, z: z - 240 },
      { x: c.x + 300, z: z - 240 },
    ],
    'street',
  ).created!;
  for (const x of [70, 190])
    road(
      sim,
      [
        { x: c.x + x, z: z - 170 },
        { x: c.x + x, z: z - 240 },
      ],
      'street',
    );
  const utilSegs = [...sim.state.net.segments.values()]
    .filter((sg) => Math.abs(sim.net.curve(sg.id).pointAt(sim.net.curve(sg.id).length / 2).z - (z - 240)) < 1)
    .map((sg) => sg.id);
  for (const def of ['coal', 'coal', 'pump', 'pump', 'pump', 'treatment', 'landfill'])
    placeOnAny(sim, def, [...utilSegs, ...util, ...west]);
  for (const def of ['firestation', 'police', 'clinic', 'primary', 'firestation', 'police', 'clinic'])
    placeOnAny(
      sim,
      def,
      [...sim.state.net.segments.values()].filter((s) => s.type === 'street').map((s) => s.id),
    );
  return {
    link: linkIds[0]!,
    c,
    // A depot on the utility street and stops through both districts: one loop over the link.
    buses: () => {
      placeOnAny(sim, 'busdepot', utilSegs.length ? [...utilSegs, ...util] : [...util]);
      const ids: number[] = [];
      for (const [x, dz] of [
        [70, -60],
        [130, 60],
        [190, -60],
        [70, 60],
        [410, -40],
        [470, -120],
        [530, -40],
      ] as const) {
        const r = sim.dispatch({ type: 'placeStop', x: c.x + x, z: z + dz });
        if (r.ok) ids.push(r.created![0]!);
      }
      return ids;
    },
    // From the east end of the utility street to the north end of the first job street.
    bypass: () =>
      road(
        sim,
        [
          { x: c.x + 300, z: z - 240 },
          { x: c.x + 410, z: z - 230 },
        ],
        'street',
      ).created!,
  };
}

function placeOnAny(sim: Sim, def: string, segs: number[]): void {
  for (const id of segs) {
    try {
      placeAlong(sim, def, id);
      return;
    } catch {
      /* next */
    }
  }
  throw new Error(`no room for ${def}`);
}
