import { Sim } from '../../src/sim/sim';
import { buildTown, serveTown, placeAlong, countBuildings } from '../../tests/helpers';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
buildTown(sim);
serveTown(sim);
for (const c of [...sim.state.civics.values()])
  if (c.def === 'landfill') sim.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: c.id } });
sim.advance(TICKS_PER_MONTH * 3);
console.log(
  'dirty',
  countBuildings(sim, (b) => b.garbage > 20),
  'pop',
  sim.state.totals.population,
  'bld',
  sim.state.totals.buildings,
);
const ave = [...sim.state.net.segments.values()].find((s) => s.type === 'avenue')!;
sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 50_000 });
const lf = placeAlong(sim, 'landfill', ave.id);
for (let k = 0; k < 12; k++) {
  sim.advance(300);
  const tr = [...sim.state.vehicles.values()].filter((v) => v.kind === 'garbage').length;
  const gsum = [...sim.state.buildings.values()].reduce((a, b) => a + b.garbage, 0);
  console.log(
    k,
    'dirty',
    countBuildings(sim, (b) => b.garbage > 20),
    'trucks',
    tr,
    'stored',
    Math.round(sim.state.civics.get(lf)!.stored),
    'sum',
    Math.round(gsum),
    'pop',
    sim.state.totals.population,
  );
}
