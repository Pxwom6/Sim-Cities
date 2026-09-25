import { Sim } from '../../src/sim/sim';
import { BState } from '../../src/sim/world/buildings';
import { buildTown, serveTown } from '../../tests/helpers';
const mode = process.argv[2] ?? 'svc';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
sim.testMode = true;
buildTown(sim);
if (mode !== 'none') serveTown(sim, mode === 'svc');
for (let m = 1; m <= Number(process.argv[3] ?? 6); m++) {
  sim.advance(720);
  const t = sim.state.totals;
  const act = [...sim.state.buildings.values()].filter((b) => b.state === BState.Active);
  const avg = (k: 'covFire' | 'covPolice' | 'covHealth' | 'covEdu' | 'covPark') =>
    (act.reduce((s, b) => s + b[k], 0) / Math.max(1, act.length)).toFixed(2);
  const lv = [0, 0, 0];
  for (const b of act) lv[b.level - 1] = (lv[b.level - 1] ?? 0) + 1;
  console.log(
    `h${m * 12} pop=${t.population} jobs=${t.jobs} bld=${t.buildings} ab=${t.abandoned} appr=${t.approval.toFixed(2)} lv=${lv} cov f${avg('covFire')} p${avg('covPolice')} h${avg('covHealth')} e${avg('covEdu')} k${avg('covPark')} inc=${sim.state.incidents.size} burn=${sim.state.burning.length} $=${sim.state.treasury}`,
  );
}
const counts = new Map<string, number[]>();
for (const b of sim.state.buildings.values()) {
  if (b.state !== BState.Active) continue;
  for (const f of sim.buildingDetails(b.id)!.factors) {
    const c = counts.get(f.label) ?? [0, 0];
    c[0]!++;
    c[1]! += f.value;
    counts.set(f.label, c);
  }
}
for (const [k, [n, s]] of [...counts].sort((a, b) => b[1]![0]! - a[1]![0]!))
  console.log(k.padEnd(32), n, (s! / n!).toFixed(3));
