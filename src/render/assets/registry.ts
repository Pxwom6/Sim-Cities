import { ZONED_DEFS } from '../../data/buildings';
import type { ModelData } from './builder';
import { buildZonedModel } from './models';

/** Number of visual variants per archetype and lot size. */
export const VARIANTS = 12;

/**
 * Asset registry: every building model comes through here, keyed by archetype, lot size and
 * variant. Procedural today; a hand-made glTF model could be registered for any key later
 * (converted into the same ModelData arrays) without touching game logic.
 */
export class AssetRegistry {
  private cache = new Map<string, ModelData>();
  private overrides = new Map<string, () => ModelData>();

  key(def: string, w: number, d: number, variant: number): string {
    return `${def}|${w}x${d}|${variant % VARIANTS}`;
  }

  /** Register a replacement model source for an archetype (all sizes and variants). */
  override(def: string, make: () => ModelData): void {
    this.overrides.set(def, make);
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${def}|`)) this.cache.delete(k);
  }

  zoned(def: string, w: number, d: number, variant: number): ModelData {
    const k = this.key(def, w, d, variant);
    let m = this.cache.get(k);
    if (!m) {
      const o = this.overrides.get(def);
      m = o ? o() : buildZonedModel(ZONED_DEFS.get(def)!, w, d, variant % VARIANTS);
      this.cache.set(k, m);
    }
    return m;
  }

  get size(): number {
    return this.cache.size;
  }
}

export const assets = new AssetRegistry();
