// Dev: triangle counts of the procedural zoned models (mean over variants) by zone and density.
import { ZONED_DEFS } from '../../src/data/buildings';
import { buildZonedModel } from '../../src/render/assets/models';
import { VARIANTS } from '../../src/render/assets/registry';

const rows = new Map<string, { tris: number; n: number; max: number }>();
for (const def of ZONED_DEFS.values()) {
  for (let v = 0; v < VARIANTS; v++) {
    const m = buildZonedModel(def, def.w, def.d, v);
    const tris = m.pos.length / 9;
    const key = `${'?RCI'[def.zone]}${def.density}`;
    const r = rows.get(key) ?? { tris: 0, n: 0, max: 0 };
    r.tris += tris;
    r.n++;
    r.max = Math.max(r.max, tris);
    rows.set(key, r);
  }
}
for (const [k, r] of [...rows].sort()) console.log(k, 'mean', Math.round(r.tris / r.n), 'max', r.max);
