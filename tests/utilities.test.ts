import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { BState } from '../src/sim/world/buildings';
import { TICKS_PER_MONTH } from '../src/sim/time';
import { CIVIC } from '../src/data/civic';
import {
  buildTown,
  connectPoint,
  countBuildings,
  newSim,
  placeAlong,
  road,
  roadsidePose,
  serveTown,
} from './helpers';

function served(sim: Sim, u: 'power' | 'water' | 'sewage'): number {
  let n = 0;
  let tot = 0;
  for (const b of sim.state.buildings.values()) {
    if (b.state !== BState.Active) continue;
    tot++;
    if (b[u] >= 0.999) n++;
  }
  return tot ? n / tot : 0;
}

describe('placing civic buildings', () => {
  it('needs road frontage, dry flat land and money; charges and can be undone', () => {
    const sim = newSim();
    const c = connectPoint(sim);
    const r = road(sim, [c, { x: c.x + 300, z: c.z }]);
    const seg = r.created![0]!;
    const t0 = sim.state.treasury;
    const id = placeAlong(sim, 'wind', seg);
    expect(sim.state.treasury).toBe(t0 - CIVIC.get('wind')!.cost);
    expect(sim.state.civics.get(id)!.access).not.toBeNull();
    // Away from any road: refused.
    const far = sim.dispatch({
      type: 'placeBuilding',
      def: 'wind',
      x: c.x + 150,
      z: c.z + 200,
      angle: 0,
      side: 1,
    });
    expect(far.ok).toBe(false);
    // Overlapping the first one: refused.
    const b = sim.state.civics.get(id)!;
    expect(
      sim.dispatch({ type: 'placeBuilding', def: 'wind', x: b.x + 2, z: b.z, angle: b.angle, side: b.side })
        .ok,
    ).toBe(false);
    // Zone cells under it are unusable.
    const blocks = [...sim.state.net.blocks.values()];
    const cellsUnder = blocks.reduce((n, bl) => n + bl.valid.filter((v) => v === 1).length, 0);
    expect(sim.dispatch({ type: 'undo' }).ok).toBe(true);
    expect(sim.state.civics.has(id)).toBe(false);
    expect(sim.state.treasury).toBe(t0);
    const cellsAfter = [...sim.state.net.blocks.values()].reduce(
      (n, bl) => n + bl.valid.filter((v) => v === 1).length,
      0,
    );
    expect(cellsAfter).toBeGreaterThan(cellsUnder);
  });

  it('river pumps and outflows must sit by the water', () => {
    const sim = newSim();
    const c = connectPoint(sim);
    const seg = road(sim, [c, { x: c.x + 300, z: c.z }]).created![0]!;
    const pose = roadsidePose(sim, seg, 150, 1, CIVIC.get('riverpump')!.d);
    const r = sim.dispatch({ type: 'placeBuilding', def: 'riverpump', ...pose });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/river|water|sea/i);
  });
});

describe('utilities', () => {
  it('a served town has power, water and sewage everywhere; a town without them suffers', () => {
    const good = newSim();
    buildTown(good);
    serveTown(good);
    good.advance(TICKS_PER_MONTH * 2);
    expect(served(good, 'power')).toBeGreaterThan(0.95);
    expect(served(good, 'water')).toBeGreaterThan(0.95);
    expect(served(good, 'sewage')).toBeGreaterThan(0.95);
    const bad = newSim();
    buildTown(bad);
    bad.advance(TICKS_PER_MONTH * 2);
    expect(served(bad, 'power')).toBe(0);
    expect(bad.state.totals.approval).toBeLessThan(good.state.totals.approval - 0.3);
    expect(bad.state.totals.population).toBeLessThan(good.state.totals.population * 0.6);
    const d = bad.buildingDetails(
      [...bad.state.buildings.values()].find((b) => b.state === BState.Active)!.id,
    )!;
    expect(d.factors.some((f) => /power/i.test(f.label))).toBe(true);
  });

  it('cutting power closes businesses, then buildings decline and are abandoned', () => {
    const sim = newSim();
    buildTown(sim);
    const { civics } = serveTown(sim);
    sim.advance(TICKS_PER_MONTH * 2);
    const pop = sim.state.totals.population;
    const jobs = sim.state.totals.jobsFilled;
    const coal = civics.find((id) => sim.state.civics.get(id)!.def === 'coal')!;
    expect(sim.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: coal } }).ok).toBe(true);
    sim.advance(60 * 14);
    expect(served(sim, 'power')).toBe(0);
    expect(countBuildings(sim, (b) => b.closed)).toBeGreaterThan(5);
    // Other utilities are unaffected.
    expect(served(sim, 'water')).toBeGreaterThan(0.9);
    sim.advance(TICKS_PER_MONTH * 3);
    expect(countBuildings(sim, (b) => b.state === BState.Abandoned)).toBeGreaterThan(10);
    expect(sim.state.totals.population).toBeLessThan(pop * 0.7);
    expect(sim.state.totals.jobsFilled).toBeLessThan(jobs * 0.5);
  });

  it('when capacity runs short, buildings farthest from the plant go without first', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH);
    // Replace the coal plant with a single small wind farm.
    for (const c of [...sim.state.civics.values()])
      if (c.def === 'coal') sim.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: c.id } });
    const seg = [...sim.state.net.segments.values()].find((s) => s.type === 'avenue')!;
    const wind = placeAlong(sim, 'wind', seg.id);
    sim.advance(60);
    const w = sim.state.civics.get(wind)!;
    const list = [...sim.state.buildings.values()].filter((b) => b.state === BState.Active);
    const near = list.filter((b) => Math.hypot(b.x - w.x, b.z - w.z) < 120);
    const far = list.filter((b) => Math.hypot(b.x - w.x, b.z - w.z) > 350);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    const avg = (xs: typeof list) => xs.reduce((s, b) => s + b.power, 0) / xs.length;
    expect(avg(near)).toBeGreaterThan(avg(far));
    expect(sim.state.utilityStats.power.unserved).toBeGreaterThan(0);
  });

  it('a plant on a road that is not connected supplies nobody in town', () => {
    const sim = newSim();
    buildTown(sim);
    sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 50_000 });
    let pts: { x: number; z: number }[] | null = null;
    for (let z = 950; z < 1900 && !pts; z += 50) {
      for (let x = 100; x < 900 && !pts; x += 50) {
        const cand = [
          { x, z },
          { x: x + 200, z },
        ];
        if (sim.preview({ type: 'buildRoad', road: 'street', points: cand }).ok) pts = cand;
      }
    }
    const isolated = road(sim, pts!).created![0]!;
    placeAlong(sim, 'coal', isolated);
    sim.advance(TICKS_PER_MONTH / 2);
    expect(served(sim, 'power')).toBe(0);
  });

  it('garbage piles up without collection and trucks clear it', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    for (const c of [...sim.state.civics.values()])
      if (c.def === 'landfill') sim.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: c.id } });
    sim.advance(TICKS_PER_MONTH * 3);
    const dirty = countBuildings(sim, (b) => b.garbage > 20);
    expect(dirty).toBeGreaterThan(10);
    const ave = [...sim.state.net.segments.values()].find((s) => s.type === 'avenue')!;
    sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 50_000 });
    const lf = placeAlong(sim, 'landfill', ave.id);
    let sawTruck = false;
    for (let k = 0; k < 60; k++) {
      sim.advance(60);
      if ([...sim.state.vehicles.values()].some((v) => v.kind === 'garbage')) sawTruck = true;
    }
    expect(sawTruck).toBe(true);
    expect(sim.state.civics.get(lf)!.stored).toBeGreaterThan(100);
    expect(countBuildings(sim, (b) => b.garbage > 20)).toBeLessThan(dirty);
  });

  it('an outflow pollutes the ground around it and the water from nearby pumps', () => {
    const sim = newSim();
    sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
    sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 100_000 });
    // Find the river bank west of the river at z≈1000.
    let wx = -1;
    for (let x = 800; x < 1800; x += 4)
      if (sim.terrain.isWater(x, 1000)) {
        wx = x;
        break;
      }
    expect(wx).toBeGreaterThan(0);
    let seg = -1;
    for (const dx of [70, 80, 90, 60, 100]) {
      const cand = [
        { x: wx - dx, z: 900 },
        { x: wx - dx, z: 1100 },
      ];
      const r = sim.dispatch({ type: 'buildRoad', road: 'street', points: cand });
      if (r.ok) {
        seg = r.created![0]!;
        break;
      }
    }
    expect(seg).toBeGreaterThan(0);
    placeAlong(sim, 'outflow', seg);
    const pump = placeAlong(sim, 'pump', seg);
    const p = sim.state.civics.get(pump)!;
    const before = sim.groundPollutionAt(p.x, p.z);
    sim.advance(TICKS_PER_MONTH * 2);
    expect(sim.groundPollutionAt(p.x, p.z)).toBeGreaterThan(Math.max(0.25, before + 0.2));
    expect(sim.civicDetails(pump)!.polluted).toBe(true);
  });
});

describe('determinism with utilities', () => {
  it('save/load and replay reproduce the state with civics and vehicles', () => {
    const opts = { seed: 'citybloom', preset: 'river' as const };
    const sim = Sim.create(opts);
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH + 333);
    expect(sim.state.civics.size).toBeGreaterThan(3);
    const loaded = Sim.fromSave(JSON.parse(JSON.stringify(sim.save())));
    expect(loaded.hash()).toBe(sim.hash());
    sim.advance(500);
    loaded.advance(500);
    expect(loaded.hash()).toBe(sim.hash());
    expect(Sim.replay(opts, sim.log, sim.tick).hash()).toBe(sim.hash());
  });
});
