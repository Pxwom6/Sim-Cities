import { Sim } from '../../src/sim/sim';
import { BState } from '../../src/sim/world/buildings';
import { buildTown, serveTown, connectPoint, road } from '../../tests/helpers';
import { happinessFactors } from '../../src/sim/systems/happiness';
import { TICKS_PER_MONTH } from '../../src/sim/time';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
buildTown(sim);
serveTown(sim);
sim.advance(TICKS_PER_MONTH * 2);
const link = sim.net.segmentsAt(sim.state.highway.connect).find((id) => id !== sim.state.highway.segment)!;
const seg = sim.state.net.segments.get(link)!;
const other = seg.a === sim.state.highway.connect ? seg.b : seg.a;
const on = sim.state.net.nodes.get(other)!;
sim.dispatch({ type: 'bulldoze', target: { kind: 'segment', id: link } });
sim.advance(TICKS_PER_MONTH * 2);
const c = connectPoint(sim);
road(sim, [c, { x: on.x, z: on.z }], 'avenue');
sim.advance(TICKS_PER_MONTH / 2);
const b = [...sim.state.buildings.values()].find((b) => b.state === BState.Abandoned)!;
console.log(b.power, b.water, b.sewage, b.covFire, b.good, sim.state.demand);
console.log(
  happinessFactors(sim, {
    ...b,
    pop: b.cap,
    employed: Math.round(b.cap / 2),
    seekers: Math.round(b.cap / 2),
  }),
);
