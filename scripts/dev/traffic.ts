// Dev: grow the served test town and print traffic: busiest segments, v/c at peak, commutes.
import { Sim } from '../../src/sim/sim';
import { BState } from '../../src/sim/world/buildings';
import { buildTown, serveTown } from '../../tests/helpers';
import { segVC, slowdown } from '../../src/sim/systems/traffic';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const months = Number(process.argv[2] ?? 4);
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
buildTown(sim);
serveTown(sim);
for (let m = 1; m <= months; m++) {
  sim.advance(TICKS_PER_MONTH);
  const act = [...sim.state.buildings.values()].filter((b) => b.state === BState.Active && b.employed > 0);
  const avgC =
    act.reduce((s, b) => s + b.commute * b.employed, 0) /
    Math.max(
      1,
      act.reduce((s, b) => s + b.employed, 0),
    );
  let total = 0;
  for (const v of sim.state.traffic.values()) total += v;
  console.log(
    `m${m} pop=${sim.state.totals.population} jobs=${sim.state.totals.jobsFilled} avgCommute=${(avgC / 60).toFixed(1)}min segs=${sim.state.traffic.size} totalPCU=${Math.round(total)} trips=${sim.tripSamples.length}`,
  );
}
const rows = [...sim.state.traffic].sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [id, v] of rows) {
  const seg = sim.state.net.segments.get(id)!;
  const mid = sim.net.curve(id).pointAt(sim.net.curve(id).length / 2);
  const vc = segVC(sim, id, 1);
  console.log(
    `seg ${id} ${seg.type.padEnd(8)} at (${mid.x.toFixed(0)},${mid.z.toFixed(0)}) vol=${v} v/c@peak=${vc.toFixed(2)} slow=${slowdown(vc).toFixed(2)}`,
  );
}
const p = sim.tripSamples.reduce(
  (m, t) => ((m[t.purpose] = (m[t.purpose] ?? 0) + 1), m),
  {} as Record<string, number>,
);
console.log('samples by purpose', p);
