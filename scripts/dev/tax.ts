import { Sim } from '../../src/sim/sim';
import { buildTown, serveTown } from '../../tests/helpers';
import { TICKS_PER_MONTH } from '../../src/sim/time';
for (const rate of [5, 9, 20]) {
  const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
  sim.testMode = true;
  buildTown(sim);
  serveTown(sim);
  sim.dispatch({ type: 'setTax', zone: 'R', wealth: 'all', rate });
  sim.advance(TICKS_PER_MONTH * 2);
  console.log(
    rate,
    sim.state.totals.population,
    sim.state.demand.R,
    sim.state.totals.approval,
    JSON.stringify(sim.state.demand.factors.R),
  );
}
