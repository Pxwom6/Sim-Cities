import { Terrain } from '../../src/sim/terrain/terrain';
for (const p of ['river', 'coast', 'lakes', 'highlands'] as const) {
  const t = new Terrain(process.argv[2] ?? 'citybloom', p);
  const hs = [...t.heights].sort((a, b) => a - b);
  const q = (f: number) => hs[Math.floor(f * (hs.length - 1))]!.toFixed(1);
  let steep = 0;
  for (let z = 0; z < 2048; z += 16) for (let x = 0; x < 2048; x += 16) if (t.slopeAt(x, z) > 0.1) steep++;
  console.log(
    p,
    'p5',
    q(0.05),
    'p25',
    q(0.25),
    'p50',
    q(0.5),
    'p75',
    q(0.75),
    'p95',
    q(0.95),
    'max',
    q(1),
    'steep%',
    ((steep / 16384) * 100).toFixed(1),
    'hwZ',
    t.gen.params.highway.connectZ,
  );
}
