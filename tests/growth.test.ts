import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { BState } from '../src/sim/world/buildings';
import { HOURLY_AT, TICKS_PER_MONTH } from '../src/sim/time';
import { ZONE_C, ZONE_I, ZONE_R } from '../src/data/zones';
import { buildTown, connectPoint, countBuildings, newSim, road, serveTown } from './helpers';

describe('demand', () => {
  it('starts with residential and industrial demand and explains it', () => {
    const sim = newSim();
    buildTown(sim, { zone: false });
    sim.advance(60);
    const d = sim.state.demand;
    expect(d.R).toBeGreaterThan(0.2);
    expect(d.I).toBeGreaterThan(0.05);
    expect(d.factors.R.some((f) => /Newcomers/.test(f.label))).toBe(true);
    expect(d.factors.I.some((f) => /Regional/.test(f.label))).toBe(true);
  });
});

describe('growth', () => {
  it('a town grows from nothing in response to zoning', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH * 2);
    const t = sim.state.totals;
    expect(t.population).toBeGreaterThan(300);
    expect(t.jobs).toBeGreaterThan(100);
    expect(t.employed).toBeGreaterThan(100);
    expect(countBuildings(sim, (b) => b.zone === ZONE_R)).toBeGreaterThan(20);
    expect(countBuildings(sim, (b) => b.zone === ZONE_C)).toBeGreaterThan(3);
    expect(countBuildings(sim, (b) => b.zone === ZONE_I)).toBeGreaterThan(3);
    // Buildings sit on their zoned cells, facing a road.
    for (const b of sim.state.buildings.values()) {
      const block = sim.state.net.blocks.get(b.block)!;
      for (let c = b.col; c < b.col + b.w; c++)
        for (let r = 0; r < b.d; r++) expect(block.bld[c * 4 + r]).toBe(b.id);
    }
  });

  it('nothing grows without zoning, or on roads not linked to the highway', () => {
    const sim = newSim();
    buildTown(sim, { zone: false });
    // An isolated road with residential zoning.
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
    expect(pts).not.toBeNull();
    const r = road(sim, pts!);
    sim.dispatch({ type: 'zone', zone: 'R', area: { kind: 'segment', id: r.created![0]! } });
    sim.advance(TICKS_PER_MONTH);
    expect(sim.state.buildings.size).toBe(0);
  });

  it('buildings upgrade when happy and the city wants more', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH * 4);
    expect(countBuildings(sim, (b) => b.level > 1 || b.density > 0)).toBeGreaterThan(10);
  });

  it('cutting the highway link leads to abandonment, and reconnecting brings people back', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH * 2);
    const pop = sim.state.totals.population;
    expect(pop).toBeGreaterThan(200);
    // Bulldoze the avenue piece touching the highway connection.
    const link = sim.net
      .segmentsAt(sim.state.highway.connect)
      .find((id) => id !== sim.state.highway.segment)!;
    const seg = sim.state.net.segments.get(link)!;
    const other = seg.a === sim.state.highway.connect ? seg.b : seg.a;
    const otherNode = sim.state.net.nodes.get(other)!;
    expect(sim.dispatch({ type: 'bulldoze', target: { kind: 'segment', id: link } }).ok).toBe(true);
    sim.advance(TICKS_PER_MONTH * 2);
    expect(countBuildings(sim, (b) => b.state === BState.Abandoned)).toBeGreaterThan(20);
    expect(sim.state.totals.population).toBeLessThan(pop * 0.5);
    // Reconnect.
    const c = connectPoint(sim);
    road(sim, [c, { x: otherNode.x, z: otherNode.z }], 'avenue');
    sim.advance(TICKS_PER_MONTH * 2);
    expect(sim.state.totals.population).toBeGreaterThan(pop * 0.5);
  });

  it('bulldozing a road demolishes its buildings; roads through buildings demolish them too', () => {
    const sim = newSim();
    const town = buildTown(sim);
    sim.advance(TICKS_PER_MONTH);
    const street = town.streets[0]!;
    const seg = sim.state.net.segments.get(street)!;
    const on = new Set<number>();
    for (const bid of [seg.left, seg.right]) {
      const b = sim.state.net.blocks.get(bid);
      if (b) for (const x of b.bld) if (x) on.add(x);
    }
    expect(on.size).toBeGreaterThan(0);
    const preview = sim.preview({ type: 'bulldoze', target: { kind: 'segment', id: street } });
    expect(preview.ok && (preview.info!.buildings as number[]).length).toBe(on.size);
    sim.dispatch({ type: 'bulldoze', target: { kind: 'segment', id: street } });
    for (const id of on) expect(sim.state.buildings.has(id)).toBe(false);
    // A new road straight through a grown block.
    const any = [...sim.state.buildings.values()].find(
      (b) => b.zone === ZONE_R && b.state === BState.Active,
    )!;
    const through = [
      { x: any.x - 60 * Math.sin(any.angle), z: any.z + 60 * Math.cos(any.angle) },
      { x: any.x + 60 * Math.sin(any.angle), z: any.z - 60 * Math.cos(any.angle) },
    ];
    const pv = sim.preview({ type: 'buildRoad', road: 'street', points: through });
    if (pv.ok) {
      expect(pv.info!.demolish as number).toBeGreaterThan(0);
      sim.dispatch({ type: 'buildRoad', road: 'street', points: through });
      expect(sim.state.buildings.has(any.id)).toBe(false);
    }
  });

  it('can bulldoze a single building', () => {
    const sim = newSim();
    buildTown(sim);
    sim.advance(TICKS_PER_MONTH);
    const b = [...sim.state.buildings.values()][0]!;
    expect(sim.dispatch({ type: 'bulldoze', target: { kind: 'building', id: b.id } }).ok).toBe(true);
    expect(sim.state.buildings.has(b.id)).toBe(false);
    const block = sim.state.net.blocks.get(b.block)!;
    expect(block.bld.includes(b.id)).toBe(false);
  });

  it('every building can explain its mood', () => {
    const sim = newSim();
    buildTown(sim);
    // Just after the hourly mood pass, when every stored mood is up to date.
    sim.advance(TICKS_PER_MONTH + HOURLY_AT.happiness + 1);
    for (const b of sim.state.buildings.values()) {
      if (b.state !== BState.Active) continue;
      const d = sim.buildingDetails(b.id)!;
      const sum = d.factors.reduce((s, f) => s + f.value, d.base);
      expect(Math.max(0, Math.min(1, sum))).toBeCloseTo(b.happiness, 1);
      expect(d.factors.length).toBeGreaterThan(0);
    }
  });
});

describe('growth determinism and saves', () => {
  it('replay and save/load reproduce the exact state of a grown town', () => {
    const opts = { seed: 'citybloom', preset: 'river' as const };
    const sim = Sim.create(opts);
    buildTown(sim);
    sim.advance(TICKS_PER_MONTH);
    const save = JSON.parse(JSON.stringify(sim.save()));
    const loaded = Sim.fromSave(save);
    expect(loaded.hash()).toBe(sim.hash());
    sim.advance(700);
    loaded.advance(700);
    expect(loaded.hash()).toBe(sim.hash());
    const replayed = Sim.replay(opts, sim.log, sim.tick);
    expect(replayed.hash()).toBe(sim.hash());
  });
});
