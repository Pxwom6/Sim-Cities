// Dev: grow the test town and print a timeline.
import { Sim } from '../../src/sim/sim';
import { buildTown } from '../../tests/helpers';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
buildTown(sim);
const months = Number(process.argv[2] ?? 6);
const t0 = Date.now();
for (let m = 1; m <= months * 4; m++) {
  sim.advance(360);
  const t = sim.state.totals;
  const d = sim.state.demand;
  const lv = [...sim.state.buildings.values()].reduce((s, b) => s + b.level, 0);
  console.log(
    `q${m} pop=${t.population} work=${t.workers} emp=${t.employed} jobs=${t.jobs}/${t.jobsFilled} bld=${t.buildings} con=${t.constructing} ab=${t.abandoned} appr=${t.approval.toFixed(2)} R=${d.R.toFixed(2)} C=${d.C.toFixed(2)} I=${d.I.toFixed(2)} lvls=${lv}`,
  );
}
console.log('ms', Date.now() - t0, 'ticks', sim.tick);
const sample = [...sim.state.buildings.values()].filter((b) => b.zone === 1).slice(0, 3);
for (const b of sample) console.log(JSON.stringify(sim.buildingDetails(b.id)));
const cs = [...sim.state.buildings.values()].filter((b) => b.zone === 2).slice(0, 2);
for (const b of cs) console.log(JSON.stringify(sim.buildingDetails(b.id)));
