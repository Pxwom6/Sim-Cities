import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { BState } from '../src/sim/world/buildings';
import { civicOnline } from '../src/sim/world/civic';
import { DISASTERS } from '../src/data/balance';
import { floodLevel, tornadoAt } from '../src/sim/systems/disasters';
import { TICKS_PER_HOUR, TICKS_PER_MONTH } from '../src/sim/time';
import { buildTown, newSim, serveTown } from './helpers';
import { lakeTown } from './disasterTown';

/** A grown, served town (shared set-up). */
function grownTown(): Sim {
  const sim = newSim();
  buildTown(sim);
  serveTown(sim);
  sim.advance(TICKS_PER_MONTH * 2);
  return sim;
}

const alive = (sim: Sim) => [...sim.state.buildings.values()].filter((b) => b.state !== BState.Rubble);
const rubble = (sim: Sim) => [...sim.state.buildings.values()].filter((b) => b.state === BState.Rubble);

function centre(sim: Sim) {
  const list = alive(sim);
  return {
    x: list.reduce((a, b) => a + b.x, 0) / list.length,
    z: list.reduce((a, b) => a + b.z, 0) / list.length,
  };
}

describe('disasters', () => {
  it('an earthquake topples buildings near the epicentre, cracks roads and knocks services out until repaired', () => {
    const sim = grownTown();
    const at = centre(sim);
    const before = alive(sim).length;
    const r = sim.dispatch({ type: 'disaster', kind: 'earthquake', at, size: 7.2 });
    expect(r.ok).toBe(true);
    sim.advance(2);
    const down = rubble(sim);
    expect(down.length).toBeGreaterThan(before * 0.1);
    expect(down.length).toBeLessThan(before);
    // Damage falls off with distance.
    const dist = (b: { x: number; z: number }) => Math.hypot(b.x - at.x, b.z - at.z);
    const near = alive(sim).filter((b) => dist(b) < 120).length + down.filter((b) => dist(b) < 120).length;
    const nearDown = down.filter((b) => dist(b) < 120).length;
    const farAll = [...sim.state.buildings.values()].filter((b) => dist(b) > 300);
    const farDown = farAll.filter((b) => b.state === BState.Rubble).length;
    expect(nearDown / Math.max(1, near)).toBeGreaterThan(farDown / Math.max(1, farAll.length));
    // Cracked roads are closed to traffic until repaired.
    const cracked = [...sim.state.roadDamage.keys()];
    expect(cracked.length).toBeGreaterThan(0);
    const g = sim.graph();
    for (const seg of cracked) expect([...g.seg].includes(seg)).toBe(false);
    // Some civic buildings are offline.
    const offline = [...sim.state.civics.values()].filter((c) => !civicOnline(c));
    expect(offline.length).toBeGreaterThan(0);
    // Ambulances answer the collapsed homes.
    expect([...sim.state.incidents.values()].some((i) => i.kind === 'emergency')).toBe(true);
    // Within four days everything is repaired, and the repairs were paid for.
    sim.advance(TICKS_PER_HOUR * 24 * 4);
    expect(sim.state.roadDamage.size).toBe(0);
    expect([...sim.state.civics.values()].every((c) => civicOnline(c))).toBe(true);
    const e = sim.state.economy;
    const repairs = (e.month.repairs ?? 0) + e.history.reduce((a, m) => a + (m.lines.repairs ?? 0), 0);
    expect(repairs).toBeLessThan(0);
  });

  it('the city rebuilds after an earthquake', () => {
    const sim = grownTown();
    const pop0 = sim.state.totals.population;
    sim.dispatch({ type: 'disaster', kind: 'earthquake', at: centre(sim), size: 7 });
    sim.advance(TICKS_PER_HOUR * 3);
    expect(sim.state.totals.population).toBeLessThan(pop0 * 0.95);
    sim.advance(TICKS_PER_MONTH * 3);
    expect(rubble(sim).length).toBe(0);
    expect(sim.state.totals.population).toBeGreaterThan(pop0 * 0.8);
  });

  it('a tornado cuts a swath along its path and leaves the rest alone', () => {
    const sim = grownTown();
    const c = centre(sim);
    const at = { x: c.x + 420, z: c.z };
    expect(sim.dispatch({ type: 'disaster', kind: 'tornado', at, size: 30, heading: Math.PI }).ok).toBe(true);
    const d = sim.state.disasters[0]!;
    const path: { x: number; z: number }[] = [];
    for (let t = d.start; t <= d.end; t++) path.push(tornadoAt(d, t));
    sim.advance(d.end - sim.state.tick + 1);
    expect(sim.state.disasters.length).toBe(0);
    const pathDist = (b: { x: number; z: number }) =>
      Math.min(...path.map((p) => Math.hypot(p.x - b.x, p.z - b.z)));
    const down = rubble(sim);
    expect(down.length).toBeGreaterThan(3);
    for (const b of down) expect(pathDist(b)).toBeLessThan(30 + 12);
    const far = [...sim.state.buildings.values()].filter((b) => pathDist(b) > 80);
    expect(far.length).toBeGreaterThan(10);
    expect(far.every((b) => b.state !== BState.Rubble)).toBe(true);
  });

  it('a tornado flattens the woods it passes through', () => {
    const sim = newSim();
    const s = sim.state;
    // Start in the thickest woods well inside the map, heading east.
    let at = { x: 0, z: 0 };
    let bestSum = -1;
    for (let j = 10; j < 118; j += 4)
      for (let i = 10; i < 80; i += 4) {
        let sum = 0;
        for (let k = 0; k < 12; k++) sum += s.trees[j * 128 + i + k]!;
        if (sum > bestSum) {
          bestSum = sum;
          at = { x: i * 16 + 8, z: j * 16 + 8 };
        }
      }
    sim.dispatch({ type: 'disaster', kind: 'tornado', at, size: 30, heading: 0 });
    const d = s.disasters[0]!;
    const path: { x: number; z: number }[] = [];
    for (let t = d.start; t <= d.end; t += 3) path.push(tornadoAt(d, t));
    const density = () =>
      path.reduce((a, p) => a + (s.trees[Math.floor(p.z / 16) * 128 + Math.floor(p.x / 16)] ?? 0), 0);
    const before = density();
    expect(before).toBeGreaterThan(0);
    sim.advance(d.end - s.tick + 1);
    expect(density()).toBeLessThan(before * 0.3);
  });

  it('a meteor destroys everything in its crater and sets fires around it', () => {
    const sim = grownTown();
    const coal = [...sim.state.civics.values()].find((c) => c.def === 'coal')!;
    const at = { x: coal.x, z: coal.z };
    const r = 40;
    const supply0 = sim.state.utilityStats.power.supply;
    sim.dispatch({ type: 'disaster', kind: 'meteor', at, size: r });
    // Nothing happens until it lands.
    sim.advance(DISASTERS.meteor.fallTicks - 2);
    expect(sim.state.civics.has(coal.id)).toBe(true);
    sim.advance(4);
    expect(sim.state.civics.has(coal.id)).toBe(false);
    for (const b of sim.state.buildings.values())
      if (Math.hypot(b.x - at.x, b.z - at.z) <= r) expect(b.state).toBe(BState.Rubble);
    expect(sim.state.craters.length).toBe(1);
    // Without the plant the town loses power.
    sim.advance(TICKS_PER_HOUR * 2);
    expect(sim.state.utilityStats.power.supply).toBeLessThan(supply0);
  });

  it('a flood covers the low ground by the water for a while, then drains', () => {
    const sim = newSim({ seed: 'b', preset: 'lakes' });
    const t = lakeTown(sim);
    sim.advance(TICKS_PER_MONTH * 2);
    const grown = alive(sim).length;
    expect(grown).toBeGreaterThan(15);
    const r = sim.dispatch({ type: 'disaster', kind: 'flood', at: t.shore });
    expect(r.ok).toBe(true);
    const d = sim.state.disasters[0]!;
    // At the crest.
    sim.advance(DISASTERS.flood.riseTicks + 120);
    const level = floodLevel(d, sim.state.tick);
    expect(level).toBeCloseTo(d.size, 1);
    const wet = [...sim.state.buildings.values()].filter((b) => b.flooded > 0);
    expect(wet.length).toBeGreaterThan(0);
    for (const b of wet) expect(sim.terrain.heightAt(b.x, b.z)).toBeLessThan(level);
    for (const b of alive(sim)) if (sim.terrain.heightAt(b.x, b.z) > level + 0.5) expect(b.flooded).toBe(0);
    expect(sim.blockedSegments().size).toBeGreaterThan(0);
    // Afterwards everything is dry again.
    sim.advance(d.end - sim.state.tick + TICKS_PER_HOUR + 1);
    expect([...sim.state.buildings.values()].every((b) => b.flooded === 0)).toBe(true);
    expect(sim.blockedSegments().size).toBe(0);
  });

  it('floods need water nearby', () => {
    const sim = newSim();
    buildTown(sim);
    const r = sim.dispatch({
      type: 'disaster',
      kind: 'flood',
      at: { x: 200, z: sim.state.net.nodes.get(sim.state.highway.connect)!.z },
    });
    expect(r.ok).toBe(false);
  });

  it('random disasters only strike when they are switched on', () => {
    const chance = DISASTERS.hourlyChance;
    const minPop = DISASTERS.minPopulation;
    try {
      DISASTERS.hourlyChance = 1;
      DISASTERS.minPopulation = 1;
      const off = grownTown();
      off.dispatch({ type: 'setDisasters', on: false });
      off.advance(TICKS_PER_HOUR * 6);
      expect(off.state.disasters.length).toBe(0);
      const on = grownTown();
      on.advance(TICKS_PER_HOUR * 2);
      expect(on.state.disasters.length).toBeGreaterThan(0);
    } finally {
      DISASTERS.hourlyChance = chance;
      DISASTERS.minPopulation = minPop;
    }
  });

  it('saving in the middle of a disaster and loading carries on identically', () => {
    const sim = grownTown();
    sim.dispatch({
      type: 'disaster',
      kind: 'tornado',
      at: { x: centre(sim).x - 300, z: centre(sim).z },
      size: 25,
    });
    sim.dispatch({ type: 'disaster', kind: 'earthquake', at: centre(sim), size: 6.4 });
    sim.advance(20);
    const loaded = Sim.fromSave(JSON.parse(JSON.stringify(sim.save())));
    loaded.testMode = true;
    expect(loaded.hash()).toBe(sim.hash());
    sim.advance(TICKS_PER_HOUR * 30);
    loaded.advance(TICKS_PER_HOUR * 30);
    expect(loaded.hash()).toBe(sim.hash());
  });
});
