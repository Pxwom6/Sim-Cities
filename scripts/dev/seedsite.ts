// Dev: how often a random seed lets a new player lay the simple starter grid off the highway (an
// avenue and four side streets, as the playthrough does), and why roads fail when they don't.
// Usage: npx tsx scripts/dev/seedsite.ts [count=40] [preset=river]
import { Sim } from '../../src/sim/sim';
import type { MapPreset } from '../../src/data/world';

const count = Number(process.argv[2] ?? 40);
const preset = (process.argv[3] ?? 'river') as MapPreset;
const reasons = new Map<string, number>();
let clean = 0;
for (let k = 0; k < count; k++) {
  const seed = `${process.env.PREFIX ?? 'site'}${k}`;
  const sim = Sim.create({ seed, preset });
  const hw = sim.state.net.nodes.get(sim.state.highway.connect)!;
  const c = { x: hw.x, z: hw.z };
  const fails: string[] = [];
  const road = (type: 'avenue' | 'street', pts: { x: number; z: number }[]) => {
    const r = sim.dispatch({ type: 'buildRoad', road: type, points: pts });
    if (!r.ok) fails.push(r.reason ?? '?');
  };
  road('avenue', [c, { x: c.x + 480, z: c.z }]);
  for (const dx of [96, 192, 288, 384])
    road('street', [
      { x: c.x + dx, z: c.z - 160 },
      { x: c.x + dx, z: c.z + 160 },
    ]);
  if (!fails.length) clean++;
  for (const f of fails) reasons.set(f, (reasons.get(f) ?? 0) + 1);
  if (fails.length) console.log(`${seed}: ${fails.length} failed (${fails.join('; ')})`);
}
console.log(`${clean}/${count} seeds take the whole grid`);
for (const [r, n] of reasons) console.log(`  ${n}× ${r}`);
