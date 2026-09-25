// Dev: lakeside town flood — peak level vs the heights of the homes near the shore.
import { Sim } from '../../src/sim/sim';
import { lakeTown } from '../../tests/disasterTown';
import { BState } from '../../src/sim/world/buildings';

const sim = Sim.create({ seed: 'b', preset: 'lakes' });
const t = lakeTown(sim);
sim.advance(1440 * 2);
const hs = [...sim.state.buildings.values()]
  .filter((b) => b.state === BState.Active)
  .map((b) => sim.terrain.heightAt(b.x, b.z))
  .sort((a, b) => a - b);
console.log('homes', hs.length, 'heights', hs.map((h) => h.toFixed(1)).join(' '));
const r = sim.dispatch({ type: 'disaster', kind: 'flood', at: t.shore });
console.log(r.ok ? `peak level ${sim.state.disasters[0]!.size.toFixed(2)}` : r.reason);
const d = sim.state.disasters[0];
if (d) {
  for (let h = 1; h <= 8; h++) {
    sim.advance(60);
    const wet = [...sim.state.buildings.values()].filter((b) => b.flooded > 0).length;
    const rub = [...sim.state.buildings.values()].filter((b) => b.state === BState.Rubble).length;
    console.log(
      'hour',
      h,
      'tick',
      sim.state.tick,
      'start',
      d.start,
      'level',
      (await import('../../src/sim/systems/disasters')).floodLevel(d, sim.state.tick).toFixed(2),
      'wet',
      wet,
      'rubble',
      rub,
      'blocked',
      sim.blockedSegments().size,
    );
  }
}
