// Dev: the two-district bottleneck, before and after a bus line.
import { Sim } from '../../src/sim/sim';
import { BState } from '../../src/sim/world/buildings';
import { twoDistricts } from '../../tests/trafficTown';
import { segVC, slowdown } from '../../src/sim/systems/traffic';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
const t = twoDistricts(sim, (process.argv[2] ?? 'dirt') as 'dirt' | 'street');
const report = (label: string) => {
  const act = [...sim.state.buildings.values()].filter((b) => b.state === BState.Active && b.employed > 0);
  const emp = act.reduce((s, b) => s + b.employed, 0);
  const avgC = act.reduce((s, b) => s + b.commute * b.employed, 0) / Math.max(1, emp);
  const vc = segVC(sim, t.link, 1);
  const lines = sim.lines();
  console.log(`${label} pop=${sim.state.totals.population} emp=${emp} avgCommute=${(avgC / 60).toFixed(1)}min link v/c=${vc.toFixed(2)} slow=${slowdown(vc).toFixed(2)} lines=${lines.length} ${lines.map((l) => `loop=${(l.loopTime / 60).toFixed(1)}min buses=${l.buses} stops=${l.stops.length} riders=${sim.state.transit.riders.get(l.depot)} load=${sim.state.transit.load.get(l.depot)}`).join(' ')}`);
};
sim.advance(TICKS_PER_MONTH * 5);
report('m5');
const stops = t.buses();
console.log('stops placed', stops.length);
for (let d = 1; d <= 4; d++) {
  sim.advance(TICKS_PER_MONTH / 2);
  report(`bus+${d * 12}h`);
}
