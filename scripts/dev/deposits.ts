// Dev: richest ore and oil cells near the highway connection (for placing mines and wells).
import { Sim } from '../../src/sim/sim';
import { GRID_CELL, GRID_RES } from '../../src/data/world';

const sim = Sim.create({
  seed: process.argv[2] ?? 'citybloom',
  preset: (process.argv[3] ?? 'river') as never,
});
const c = sim.state.net.nodes.get(sim.state.highway.connect)!;
for (const kind of ['ore', 'oil'] as const) {
  const r = sim.terrain[kind];
  const cells: { v: number; x: number; z: number; d: number; h: number }[] = [];
  for (let j = 0; j < GRID_RES; j++)
    for (let i = 0; i < GRID_RES; i++) {
      const v = r[j * GRID_RES + i]! / 255;
      if (v < 0.4) continue;
      const x = (i + 0.5) * GRID_CELL;
      const z = (j + 0.5) * GRID_CELL;
      cells.push({ v, x, z, d: Math.hypot(x - c.x, z - c.z), h: sim.terrain.heightAt(x, z) });
    }
  cells.sort((a, b) => a.d - b.d);
  console.log(
    kind,
    cells.length,
    'cells ≥0.4; nearest:',
    cells
      .slice(0, 5)
      .map((q) => `(${q.x},${q.z}) v${q.v.toFixed(2)} d${q.d.toFixed(0)} h${q.h.toFixed(1)}`)
      .join(' '),
  );
}
