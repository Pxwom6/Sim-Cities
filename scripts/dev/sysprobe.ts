// Dev: time the heavy hourly systems on a saved city (e.g. from `bench.ts --big --save city.gz`), and
// print a checksum of land value so optimisations can be checked for identical results.
// Usage: npx tsx scripts/dev/sysprobe.ts city.gz
import { readFileSync } from 'node:fs';
import { gunzipSync, strFromU8 } from 'fflate';
import { Sim } from '../../src/sim/sim';
import { updateLandValue } from '../../src/sim/systems/landValue';
import { fnv1a } from '../../src/sim/hash';
import { computeCoverage } from '../../src/sim/systems/services';
import { updateUtilities } from '../../src/sim/systems/utilities';

const sim = Sim.fromSave(JSON.parse(strFromU8(gunzipSync(readFileSync(process.argv[2]!)))));
const time = (name: string, fn: () => void, n = 5) => {
  const ms: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    fn();
    ms.push(performance.now() - a);
  }
  console.log(`${name.padEnd(10)} ${ms.map((x) => x.toFixed(1).padStart(6)).join('')} ms`);
};
console.log(
  `population ${sim.state.totals.population}, buildings ${sim.state.buildings.size}, civics ${sim.state.civics.size}`,
);
const lv0 = Float32Array.from(sim.state.landValue);
time('landValue', () => {
  sim.state.landValue.set(lv0);
  updateLandValue(sim);
});
console.log(`landValue checksum ${fnv1a(Array.from(sim.state.landValue).join(','))}`);
// The whole hour's schedule, per system (worst of a few game hours).
const worst = new Map<string, number>();
sim.timer = (name, fn) => {
  const a = performance.now();
  fn();
  worst.set(name, Math.max(worst.get(name) ?? 0, performance.now() - a));
};
time('coverage', () => computeCoverage(sim));
time('utilities', () => updateUtilities(sim));
sim.advance(60 * 6);
console.log(
  [...worst]
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => `${n} ${v.toFixed(1)}`)
    .join(', '),
);
