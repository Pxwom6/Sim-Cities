// Benchmark: build a large grid city headlessly, grow it, and report sim tick times.
// Usage: npx tsx scripts/bench.ts [months] [gridSize]
import { Sim } from '../src/sim/sim';
import { TICKS_PER_MONTH } from '../src/sim/time';

const months = Number(process.argv[2] ?? 12);
const cells = Number(process.argv[3] ?? 9);
const sim = Sim.create({ seed: 'bench', preset: 'river', sandbox: true });
const hw = sim.state.net.nodes.get(sim.state.highway.connect)!;
const spacing = 110;
const x0 = hw.x;
const z0 = Math.max(80, hw.z - (spacing * cells) / 2);
let built = 0;
let failed = 0;
const tryRoad = (road: 'avenue' | 'street', points: { x: number; z: number }[]) => {
  const r = sim.dispatch({ type: 'buildRoad', road, points });
  if (r.ok) built++;
  else failed++;
};
tryRoad('avenue', [
  { x: hw.x, z: hw.z },
  { x: x0 + spacing * cells, z: hw.z },
]);
for (let i = 0; i <= cells; i++)
  tryRoad(i % 3 === 0 ? 'avenue' : 'street', [
    { x: x0 + 40 + i * spacing, z: z0 },
    { x: x0 + 40 + i * spacing, z: z0 + spacing * cells },
  ]);
for (let j = 0; j <= cells; j++)
  tryRoad('street', [
    { x: x0 + 40, z: z0 + j * spacing },
    { x: x0 + 40 + spacing * cells, z: z0 + j * spacing },
  ]);
// Zone: residential everywhere, commercial on avenues, industry in one corner.
for (let j = 0; j < cells; j++) {
  for (let i = 0; i < cells; i++) {
    const cx = x0 + 40 + (i + 0.5) * spacing;
    const cz = z0 + (j + 0.5) * spacing;
    const zone = i >= cells - 2 && j >= cells - 3 ? 'I' : (i + j) % 4 === 0 ? 'C' : 'R';
    sim.dispatch({
      type: 'zone',
      zone,
      area: { kind: 'brush', points: [{ x: cx, z: cz }], radius: spacing * 0.75 },
    });
  }
}
console.log(`roads built ${built}, failed ${failed}, segments ${sim.state.net.segments.size}`);
const t0 = performance.now();
let worst = 0;
for (let m = 1; m <= months; m++) {
  const ms: number[] = [];
  for (let k = 0; k < TICKS_PER_MONTH; k++) {
    const a = performance.now();
    sim.step();
    const d = performance.now() - a;
    ms.push(d);
    if (d > worst) worst = d;
  }
  ms.sort((a, b) => a - b);
  const avg = ms.reduce((s, x) => s + x, 0) / ms.length;
  const t = sim.state.totals;
  console.log(
    `month ${m}: pop ${t.population} jobs ${t.jobs} bld ${t.buildings} | tick avg ${avg.toFixed(3)} ms p99 ${ms[Math.floor(ms.length * 0.99)]!.toFixed(2)} max ${ms[ms.length - 1]!.toFixed(1)} ms`,
  );
}
console.log(`total ${(performance.now() - t0).toFixed(0)} ms, worst tick ${worst.toFixed(1)} ms`);
