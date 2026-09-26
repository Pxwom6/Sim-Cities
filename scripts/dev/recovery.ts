// Dev: population after an earthquake vs the same town without one, month by month.
import { Sim } from '../../src/sim/sim';
import { buildTown, serveTown } from '../../tests/helpers';
import { BState } from '../../src/sim/world/buildings';

function town(): Sim {
  const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
  buildTown(sim);
  serveTown(sim);
  sim.advance(1440 * 2);
  return sim;
}
const a = town();
const b = town();
const list = [...b.state.buildings.values()].filter((x) => x.state !== BState.Rubble);
const at = {
  x: list.reduce((s, x) => s + x.x, 0) / list.length,
  z: list.reduce((s, x) => s + x.z, 0) / list.length,
};
b.dispatch({ type: 'disaster', kind: 'earthquake', at, size: Number(process.argv[2] ?? 7) });
for (let m = 0; m <= 8; m++) {
  const count = (s: Sim, st: number) => [...s.state.buildings.values()].filter((x) => x.state === st).length;
  console.log(
    `month ${m}: control pop ${a.state.totals.population} | quake pop ${b.state.totals.population} rubble ${count(b, BState.Rubble)} building ${count(b, BState.Construction)} active ${count(b, BState.Active)} abandoned ${count(b, BState.Abandoned)} approval ${(b.state.totals as unknown as { approval?: number }).approval ?? '-'} demand R ${b.state.demand.R.toFixed(2)} I ${b.state.demand.I.toFixed(2)}`,
  );
  a.advance(1440);
  b.advance(1440);
}
