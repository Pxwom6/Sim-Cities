import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/sim/terrain/terrain';
import { MAP_PRESETS, MAP_SIZE, GRID_RES } from '../src/data/world';

describe('terrain generation', () => {
  it('is deterministic per seed and preset', () => {
    const a = new Terrain('det', 'river');
    const b = new Terrain('det', 'river');
    expect(a.heights).toEqual(b.heights);
    expect(a.initialTrees).toEqual(b.initialTrees);
    const c = new Terrain('det2', 'river');
    expect(c.heights).not.toEqual(a.heights);
  });

  for (const preset of MAP_PRESETS.map((p) => p.id)) {
    it(`${preset}: has land, water where expected, forests and resources`, () => {
      const t = new Terrain('check', preset);
      let water = 0;
      let land = 0;
      let min = Infinity;
      let max = -Infinity;
      for (const h of t.heights) {
        if (!Number.isFinite(h)) throw new Error('non-finite height');
        if (h < 0.6) water++;
        else land++;
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
      expect(land / t.heights.length).toBeGreaterThan(0.55);
      if (preset !== 'lakes') expect(water).toBeGreaterThan(100);
      expect(max).toBeLessThan(200);
      expect(min).toBeGreaterThan(-30);
      const forest = t.initialTrees.reduce((s, v) => s + (v > 60 ? 1 : 0), 0);
      expect(forest / (GRID_RES * GRID_RES)).toBeGreaterThan(0.05);
      expect(Math.max(...t.groundwater)).toBeGreaterThan(150);
      expect(Math.max(...t.ore)).toBeGreaterThan(0);
      // The highway connection lands on dry, gentle ground at the west edge.
      const z = t.gen.params.highway.connectZ;
      for (let x = 0; x <= 200; x += 20) {
        expect(t.isWater(x, z)).toBe(false);
        expect(t.slopeAt(x, z)).toBeLessThan(0.15);
      }
    });
  }

  it('the river preset has a river crossing the map', () => {
    const t = new Terrain('river-check', 'river');
    let crossings = 0;
    for (let z = 100; z < MAP_SIZE; z += 400) {
      let sawWater = false;
      for (let x = 600; x < MAP_SIZE; x += 8) if (t.isWater(x, z)) sawWater = true;
      if (sawWater) crossings++;
    }
    expect(crossings).toBeGreaterThanOrEqual(4);
  });
});
