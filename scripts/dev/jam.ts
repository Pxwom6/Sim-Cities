// Dev: the two-district bottleneck, before and after a bypass.
import { Sim } from '../../src/sim/sim';
import { BState } from '../../src/sim/world/buildings';
import { twoDistricts } from '../../tests/trafficTown';
import { segVC, slowdown } from '../../src/sim/systems/traffic';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const link = (process.argv[2] ?? 'dirt') as 'dirt' | 'street';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
const t = twoDistricts(sim, link);
const report = (label: string) => {
  const act = [...sim.state.buildings.values()].filter((b) => b.state === BState.Active && b.employed > 0);
  const emp = act.reduce((s, b) => s + b.employed, 0);
  const avgC = act.reduce((s, b) => s + b.commute * b.employed, 0) / Math.max(1, emp);
  const vc = segVC(sim, t.link, 1);
  console.log(
    `${label} pop=${sim.state.totals.population} employed=${emp} unemployed=${sim.state.totals.unemployed} avgCommute=${(avgC / 60).toFixed(1)}min link vol=${sim.state.traffic.get(t.link)} v/c=${vc.toFixed(2)} slow=${slowdown(vc).toFixed(2)} appr=${sim.state.totals.approval.toFixed(2)}`,
  );
};
for (let m = 1; m <= 5; m++) {
  sim.advance(TICKS_PER_MONTH);
  report(`m${m}`);
}
t.bypass();
for (let d = 1; d <= 4; d++) {
  sim.advance(TICKS_PER_MONTH / 2);
  report(`bypass+${d * 12}h`);
}
