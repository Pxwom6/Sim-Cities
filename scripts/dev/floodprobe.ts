// Dev: how high is the land near water? Histogram of terrain height by distance to water.
import { Sim } from '../../src/sim/sim';
import { GRID_CELL, GRID_RES } from '../../src/data/world';

const sim = Sim.create({
  seed: process.argv[2] ?? 'citybloom',
  preset: (process.argv[3] as never) ?? 'river',
});
const wd = sim.waterDist();
const bands = [0, 50, 100, 200, 320];
for (let k = 0; k < bands.length - 1; k++) {
  const hs: number[] = [];
  for (let j = 0; j < GRID_RES; j++)
    for (let i = 0; i < GRID_RES; i++) {
      const d = wd[j * GRID_RES + i]!;
      if (d <= bands[k]! || d > bands[k + 1]!) continue;
      const h = sim.terrain.heightAt((i + 0.5) * GRID_CELL, (j + 0.5) * GRID_CELL);
      if (h > 0) hs.push(h);
    }
  hs.sort((a, b) => a - b);
  const q = (p: number) => hs[Math.floor(p * (hs.length - 1))]?.toFixed(1);
  console.log(
    `water ${bands[k]}-${bands[k + 1]} m: n=${hs.length} p10 ${q(0.1)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)}`,
  );
}
const hz = sim.state.net.nodes.get(sim.state.highway.connect)!;
console.log(
  'highway connect',
  hz.x.toFixed(0),
  hz.z.toFixed(0),
  'height',
  sim.terrain.heightAt(hz.x, hz.z).toFixed(1),
  'water dist',
  wd[Math.floor(hz.z / GRID_CELL) * GRID_RES + Math.floor(hz.x / GRID_CELL)],
);
// Nearest water to the highway connection, and heights along the straight line to it.
let best = { d: 1e9, x: 0, z: 0 };
for (let j = 0; j < GRID_RES; j++)
  for (let i = 0; i < GRID_RES; i++) {
    if (wd[j * GRID_RES + i]! > 0) continue;
    const x = (i + 0.5) * GRID_CELL;
    const z = (j + 0.5) * GRID_CELL;
    const d = Math.hypot(x - hz.x, z - hz.z);
    if (d < best.d) best = { d, x, z };
  }
console.log('nearest water', best.x, best.z, 'dist', best.d.toFixed(0));
const line: string[] = [];
for (let t = 0; t <= 1; t += 0.05) {
  const x = hz.x + (best.x - hz.x) * t;
  const z = hz.z + (best.z - hz.z) * t;
  line.push(sim.terrain.heightAt(x, z).toFixed(1));
}
console.log('heights along', line.join(' '));
// Along z = 600 eastwards.
const east: string[] = [];
for (let x = 0; x <= 2000; x += 100) east.push(`${x}:${sim.terrain.heightAt(x, 600).toFixed(1)}`);
console.log('z=600', east.join(' '));
