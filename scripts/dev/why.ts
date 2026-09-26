import { Sim } from '../../src/sim/sim';
import { buildTown, connectPoint, roadsidePose } from '../../tests/helpers';
import { CIVIC } from '../../src/data/civic';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
buildTown(sim);
sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
const c = connectPoint(sim);
const r = sim.dispatch({
  type: 'buildRoad',
  road: 'street',
  points: [
    { x: c.x + 30, z: c.z + 230 },
    { x: c.x + 470, z: c.z + 230 },
  ],
});
console.log(r.ok, r.ok ? '' : r.reason);
const reasons: Record<string, number> = {};
for (const seg of sim.state.net.segments.values()) {
  const len = sim.net.curve(seg.id).length;
  for (let s = 20; s < len - 20; s += 8)
    for (const side of [1, -1] as const) {
      const pose = roadsidePose(sim, seg.id, s, side, CIVIC.get('treatment')!.d);
      const p = sim.preview({ type: 'placeBuilding', def: 'treatment', ...pose });
      const k = p.ok ? 'OK' : p.reason;
      reasons[k] = (reasons[k] ?? 0) + 1;
    }
}
console.log(reasons);
