// Dev: the wind street — homes upwind and downwind of coal plants.
import { Sim } from '../../src/sim/sim';
import { BState } from '../../src/sim/world/buildings';
import { windStreet } from '../../tests/envTown';
import { placeAlong } from '../../tests/helpers';
import { fieldAt } from '../../src/sim/systems/pollution';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
const t = windStreet(sim);
const plantZ = t.plants.map((id) => sim.state.civics.get(id)!.z);
console.log(
  'plants at z',
  plantZ.map((z) => z.toFixed(0)),
  'mid',
  t.mid,
);
const zc = plantZ.reduce((a, b) => a + b, 0) / plantZ.length;
const side = (up: boolean) => {
  const homes = [...sim.state.buildings.values()].filter(
    (b) => b.state === BState.Active && b.zone === 1 && b.pop > 0 && (up ? b.z < zc - 80 : b.z > zc + 80),
  );
  const pop = homes.reduce((s, b) => s + b.pop, 0);
  const air =
    homes.reduce((s, b) => s + fieldAt(sim.state.airPollution, b.x, b.z) * b.pop, 0) / Math.max(1, pop);
  const sick = homes.reduce((s, b) => s + b.sick, 0) / Math.max(1, pop);
  const h = homes.reduce((s, b) => s + b.happiness * b.pop, 0) / Math.max(1, pop);
  const ground =
    homes.reduce((s, b) => s + fieldAt(sim.state.groundPollution, b.x, b.z), 0) / Math.max(1, homes.length);
  const pw = homes.reduce((s, b) => s + b.polluted, 0) / Math.max(1, homes.length);
  return `${up ? 'UP' : 'DOWN'} homes=${homes.length} pop=${pop} air=${air.toFixed(3)} ground=${ground.toFixed(3)} pw=${pw.toFixed(2)} sick=${(sick * 100).toFixed(2)}% mood=${h.toFixed(2)}`;
};
for (let m = 1; m <= 4; m++) {
  sim.advance(TICKS_PER_MONTH);
  console.log(`m${m}`, side(true), '|', side(false));
}
for (const id of t.plants) sim.dispatch({ type: 'bulldoze', target: { kind: 'civic', id } });
const av = [...sim.state.net.segments.values()].filter((s) => s.type === 'avenue').map((s) => s.id);
let n = 0;
for (const id of av)
  for (let k = 0; k < 4; k++) {
    try {
      placeAlong(sim, 'wind', id);
      n++;
    } catch {
      break;
    }
  }
console.log('coal removed; wind turbines instead:', n);
for (let m = 1; m <= 2; m++) {
  sim.advance(TICKS_PER_MONTH);
  console.log(
    `clean+${m}`,
    side(true),
    '|',
    side(false),
    'power',
    JSON.stringify(sim.state.utilityStats.power),
  );
}
