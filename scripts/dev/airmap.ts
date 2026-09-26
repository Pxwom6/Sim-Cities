// Dev: print the air pollution field around the first coal plant of the served town.
import { Sim } from '../../src/sim/sim';
import { buildTown, serveTown } from '../../tests/helpers';
import { windAngle } from '../../src/sim/systems/pollution';
import { GRID_RES } from '../../src/data/world';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
buildTown(sim);
serveTown(sim);
sim.advance(TICKS_PER_MONTH * 2);
const coal = [...sim.state.civics.values()].find((c) => c.def === 'coal')!;
const a = windAngle('citybloom', sim.state.tick);
console.log('coal', coal.x, coal.z, 'wind', Math.cos(a).toFixed(2), Math.sin(a).toFixed(2));
const ci = Math.floor(coal.x / 16);
const cj = Math.floor(coal.z / 16);
for (let j = cj - 6; j <= cj + 16; j++) {
  let row = `${String(j).padStart(3)} `;
  for (let i = Math.max(0, ci - 6); i <= ci + 8; i++) {
    const v = sim.state.airPollution[j * GRID_RES + i]!;
    row += (v * 100).toFixed(0).padStart(4);
  }
  console.log(row);
}
