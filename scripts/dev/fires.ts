// Dev: how far fires spread in a served town without a fire station.
import { buildTown, newSim, serveTown } from '../../tests/helpers';
import { BState } from '../../src/sim/world/buildings';
import { TICKS_PER_MONTH } from '../../src/sim/time';
for (const seed of ['citybloom', 'a', 'b']) {
  const sim = newSim({ seed });
  try {
    buildTown(sim);
    serveTown(sim, false);
  } catch {
    continue;
  }
  sim.events = [];
  sim.advance(TICKS_PER_MONTH * 4);
  const fires = new Set(sim.events.filter((e) => e.kind === 'fire').map((e) => e.id)).size;
  const destroyed = sim.events.filter((e) => e.kind === 'destroyed').length;
  const rubble = [...sim.state.buildings.values()].filter((b) => b.state === BState.Rubble).length;
  console.log(
    seed,
    'buildings',
    sim.state.totals.buildings,
    'fires',
    fires,
    'destroyed',
    destroyed,
    'rubble now',
    rubble,
  );
}
