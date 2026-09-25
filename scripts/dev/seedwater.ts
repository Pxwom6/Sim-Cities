import { Sim } from '../../src/sim/sim';
import { GRID_CELL, GRID_RES } from '../../src/data/world';
for (const preset of ['river', 'coast', 'lakes']) {
  for (const seed of ['citybloom', 'a', 'b', 'c', 'd', 'e', 'flood', 'harbour']) {
    const sim = Sim.create({ seed, preset: preset as never });
    const wd = sim.waterDist();
    const hz = sim.state.net.nodes.get(sim.state.highway.connect)!;
    let best = 1e9;
    for (let j = 0; j < GRID_RES; j++)
      for (let i = 0; i < GRID_RES; i++) {
        if (wd[j * GRID_RES + i]! > 0) continue;
        best = Math.min(best, Math.hypot((i + 0.5) * GRID_CELL - hz.x, (j + 0.5) * GRID_CELL - hz.z));
      }
    console.log(preset, seed, 'connect', hz.x.toFixed(0), hz.z.toFixed(0), 'water', best.toFixed(0));
  }
}
