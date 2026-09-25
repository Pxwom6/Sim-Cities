import { Sim } from '../../src/sim/sim';
import { buildTown, serveTown } from '../../tests/helpers';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
buildTown(sim);
const r = serveTown(sim);
console.log(
  'civics',
  r.civics.map((id) => sim.state.civics.get(id)!.def),
  'treasury',
  sim.state.treasury,
);
for (let m = 1; m <= 12; m++) {
  sim.advance(720);
  const t = sim.state.totals;
  const u = sim.state.utilityStats;
  console.log(
    `h${m * 12} pop=${t.population} jobs=${t.jobs} bld=${t.buildings} ab=${t.abandoned} appr=${t.approval.toFixed(2)} pow=${u.power.supply}/${u.power.demand} wat=${u.water.supply}/${u.water.demand} sew=${u.sewage.supply}/${u.sewage.demand} veh=${sim.state.vehicles.size} $=${sim.state.treasury}`,
  );
}
const g = [...sim.state.buildings.values()].reduce((a, b) => a + b.garbage, 0);
console.log(
  'garbage total',
  Math.round(g),
  'landfill',
  [...sim.state.civics.values()].map((c) => `${c.def}:${Math.round(c.stored)}`).join(' '),
);
