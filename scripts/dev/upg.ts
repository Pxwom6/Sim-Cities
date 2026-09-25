import { Sim } from '../../src/sim/sim';
import { buildTown } from '../../tests/helpers';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
buildTown(sim);
sim.advance(1440 * 4);
const hist: Record<string, number> = {};
for (const b of sim.state.buildings.values()) {
  const k = `z${b.zone} d${b.density} L${b.level} w${b.wealth} good${Math.min(b.good, 5)} h${b.happiness >= 0.62 ? 'hi' : 'lo'} occ${b.cap ? (b.pop / b.cap).toFixed(1) : 'x'}`;
  hist[k] = (hist[k] ?? 0) + 1;
}
console.log(hist, sim.state.demand.R);
const b = [...sim.state.buildings.values()].find((x) => x.zone === 1 && x.level === 1 && x.pop < x.cap)!;
console.log(b);
sim.advance(10);
console.log(b.pop, b.cap, b.happiness);
