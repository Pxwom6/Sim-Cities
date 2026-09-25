// Dev: environment, health and education in the served town.
import { Sim } from '../../src/sim/sim';
import { BState } from '../../src/sim/world/buildings';
import { buildTown, serveTown } from '../../tests/helpers';
import { fieldAt, windAngle } from '../../src/sim/systems/pollution';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const sim = Sim.create({ seed: process.argv[2] ?? 'citybloom', preset: 'river' });
sim.testMode = true;
buildTown(sim);
serveTown(sim);
const a = windAngle(sim.state.options.seed, 0);
console.log(
  'wind towards',
  ((a * 180) / Math.PI).toFixed(0),
  'deg  dir',
  Math.cos(a).toFixed(2),
  Math.sin(a).toFixed(2),
);
const coal = [...sim.state.civics.values()].find((c) => c.def === 'coal')!;
console.log('coal at', coal.x.toFixed(0), coal.z.toFixed(0));
for (let m = 1; m <= Number(process.argv[3] ?? 6); m++) {
  sim.advance(TICKS_PER_MONTH);
  const homes = [...sim.state.buildings.values()].filter(
    (b) => b.state === BState.Active && b.zone === 1 && b.pop > 0,
  );
  const pop = homes.reduce((s, b) => s + b.pop, 0);
  const sick = homes.reduce((s, b) => s + b.sick, 0);
  const untreated = homes.reduce((s, b) => s + b.sick * (1 - b.treated), 0);
  const edu = homes.reduce((s, b) => s + b.edu * b.pop, 0) / Math.max(1, pop);
  const air =
    homes.reduce((s, b) => s + fieldAt(sim.state.airPollution, b.x, b.z) * b.pop, 0) / Math.max(1, pop);
  let maxAir = 0;
  for (const v of sim.state.airPollution) maxAir = Math.max(maxAir, v);
  const tiers = [0, 0, 0];
  for (const b of sim.state.buildings.values())
    if (b.zone === 3 && b.state === BState.Active) tiers[b.wealth]!++;
  const offices = [...sim.state.buildings.values()].filter((b) => b.zone === 2 && b.wealth === 2).length;
  console.log(
    `m${m} pop=${pop} sick=${sick.toFixed(0)} (${((sick / Math.max(1, pop)) * 100).toFixed(1)}%) untreated=${untreated.toFixed(0)} air@homes=${air.toFixed(3)} maxAir=${maxAir.toFixed(2)} edu=${edu.toFixed(2)} workforce=${sim.state.totals.eduWorkforce} ind tiers=${tiers} offices=${offices} appr=${sim.state.totals.approval.toFixed(2)}`,
  );
}
// Air profile along the wind through the coal plant.
const row = [];
for (let d = -400; d <= 800; d += 80)
  row.push(
    `${d}:${fieldAt(sim.state.airPollution, coal.x + Math.cos(a) * d, coal.z + Math.sin(a) * d).toFixed(3)}`,
  );
console.log('air along wind from coal', row.join(' '));
