import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/sim/terrain/terrain';
import { TERRAIN_VERSION } from '../src/sim/terrain/generate';
import { MAP_PRESETS, MAP_SIZE, GRID_RES } from '../src/data/world';
import { Sim } from '../src/sim/sim';

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

describe('terrain versions', () => {
  it('v2: every seed and preset takes a first grid of streets off the highway', () => {
    // An avenue and four crossing streets, as a new player lays out (the playthrough does too).
    // On the original terrain about a third of river seeds had some of these too steep.
    for (const preset of MAP_PRESETS.map((p) => p.id))
      for (let k = 0; k < 4; k++) {
        const sim = Sim.create({ seed: `start${k}`, preset });
        expect(sim.state.options.terrain).toBe(TERRAIN_VERSION);
        const hw = sim.state.net.nodes.get(sim.state.highway.connect)!;
        const road = (type: 'avenue' | 'street', a: [number, number], b: [number, number]) =>
          sim.dispatch({
            type: 'buildRoad',
            road: type,
            points: [
              { x: hw.x + a[0], z: hw.z + a[1] },
              { x: hw.x + b[0], z: hw.z + b[1] },
            ],
          });
        expect(road('avenue', [0, 0], [480, 0]).ok, `${preset} start${k} avenue`).toBe(true);
        for (const dx of [96, 192, 288, 384])
          expect(road('street', [dx, -160], [dx, 160]).ok, `${preset} start${k} street at ${dx}`).toBe(true);
      }
  });

  it('a city keeps the terrain version it was founded with, and older saves keep the original', () => {
    const v1 = new Terrain('keep', 'highlands', 1);
    const v2 = new Terrain('keep', 'highlands', 2);
    expect(v2.heights).not.toEqual(v1.heights);
    // Only the start area changes: far from the highway entrance the ground is the same.
    expect(v2.heightAt(1800, 300)).toBeCloseTo(v1.heightAt(1800, 300), 5);
    const old = Sim.create({ seed: 'keep', preset: 'highlands', terrain: 1 });
    const save = old.save();
    const loaded = Sim.fromSave(JSON.parse(JSON.stringify(save)));
    expect(loaded.terrain.heights).toEqual(v1.heights);
    // A save from before terrain versions (v9) migrates to the original terrain.
    const legacy = JSON.parse(JSON.stringify(save));
    legacy.version = 9;
    delete legacy.state.options.terrain;
    expect(Sim.fromSave(legacy).state.options.terrain).toBe(1);
    expect(Sim.fromSave(legacy).terrain.heights).toEqual(v1.heights);
  });
});
