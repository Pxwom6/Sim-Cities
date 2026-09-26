// Dev: can we build a road from the highway down to the lake shore (for flood scenarios)?
import { Sim } from '../../src/sim/sim';
import { GRID_CELL, GRID_RES } from '../../src/data/world';

const seed = process.argv[2] ?? 'b';
const preset = (process.argv[3] ?? 'lakes') as never;
const sim = Sim.create({ seed, preset });
sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 500_000 });
const wd = sim.waterDist();
const hz = sim.state.net.nodes.get(sim.state.highway.connect)!;
let best = { d: 1e9, x: 0, z: 0 };
for (let j = 0; j < GRID_RES; j++)
  for (let i = 0; i < GRID_RES; i++) {
    if (wd[j * GRID_RES + i]! > 0) continue;
    const x = (i + 0.5) * GRID_CELL;
    const z = (j + 0.5) * GRID_CELL;
    const d = Math.hypot(x - hz.x, z - hz.z);
    if (d < best.d) best = { d, x, z };
  }
console.log('connect', hz.x, hz.z, 'water', best);
const dx = (best.x - hz.x) / best.d;
const dz = (best.z - hz.z) / best.d;
for (const stop of [80, 120, 160, 200]) {
  const end = { x: hz.x + dx * (best.d - stop), z: hz.z + dz * (best.d - stop) };
  const r = sim.preview({ type: 'buildRoad', road: 'avenue', points: [{ x: hz.x, z: hz.z }, end] });
  console.log(
    'stop',
    stop,
    'end',
    end.x.toFixed(0),
    end.z.toFixed(0),
    'h',
    sim.terrain.heightAt(end.x, end.z).toFixed(1),
    r.ok ? 'ok' : r.reason,
  );
}
const line: string[] = [];
for (let t = 0; t <= 1.0001; t += 0.1)
  line.push(sim.terrain.heightAt(hz.x + dx * best.d * t, hz.z + dz * best.d * t).toFixed(1));
console.log(line.join(' '));
