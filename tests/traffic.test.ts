import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { BState } from '../src/sim/world/buildings';
import { TICKS_PER_HOUR, TICKS_PER_MONTH, ticksUntilHour } from '../src/sim/time';
import { segVC } from '../src/sim/systems/traffic';
import { segSpeed } from '../src/sim/systems/vehicles';
import { ROAD_TYPES } from '../src/data/roads';
import { buildTown, newSim, serveTown } from './helpers';
import { twoDistricts } from './trafficTown';

function avgCommute(sim: Sim): number {
  let n = 0;
  let t = 0;
  for (const b of sim.state.buildings.values()) {
    if (b.state !== BState.Active || b.employed <= 0) continue;
    n += b.employed;
    t += b.commute * b.employed;
  }
  return n ? t / n : 0;
}

function totalVolume(sim: Sim): number {
  let v = 0;
  for (const x of sim.state.traffic.values()) v += x;
  return v;
}

/** Advance to the next time the clock reads `hour`:00. */
function advanceToHour(sim: Sim, hour: number): void {
  sim.advance(ticksUntilHour(sim.state.tick, hour));
}

describe('traffic', () => {
  it('grows with the city and loads the roads people actually use', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH);
    const early = totalVolume(sim);
    sim.advance(TICKS_PER_MONTH * 2);
    const later = totalVolume(sim);
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early * 1.8);
    // Every loaded segment exists; the busiest ones are town roads, not the empty highway spur.
    for (const id of sim.state.traffic.keys()) expect(sim.state.net.segments.has(id)).toBe(true);
    const busiest = [...sim.state.traffic].sort((a, b) => b[1] - a[1])[0]!;
    expect(['avenue', 'street']).toContain(sim.state.net.segments.get(busiest[0])!.type);
  });

  it('a narrow link between homes and jobs jams at rush hour, and a bypass relieves it', () => {
    const sim = newSim();
    const t = twoDistricts(sim, 'dirt');
    sim.advance(TICKS_PER_MONTH * 5);
    const jam = segVC(sim, t.link, 1);
    const before = avgCommute(sim);
    expect(jam).toBeGreaterThan(1.5);
    expect(before).toBeGreaterThan(5 * 60);
    t.bypass();
    sim.advance(TICKS_PER_MONTH * 2);
    expect(segVC(sim, t.link, 1)).toBeLessThan(jam * 0.7);
    expect(avgCommute(sim)).toBeLessThan(before * 0.6);
  });

  it('congestion peaks at rush hour and service vehicles are slowed by it', () => {
    const sim = newSim();
    const t = twoDistricts(sim, 'dirt');
    sim.advance(TICKS_PER_MONTH * 5);
    const free = ROAD_TYPES.dirt.speed / 3.6;
    advanceToHour(sim, 8);
    const rush = segSpeed(sim, t.link);
    advanceToHour(sim, 3);
    const night = segSpeed(sim, t.link);
    expect(rush).toBeLessThan(free * 0.5);
    expect(night).toBeGreaterThan(free * 0.9);
  });

  it('freight runs from industry to shops and out to the highway', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH * 3);
    expect(sim.state.traffic.get(sim.state.highway.segment) ?? 0).toBeGreaterThan(0);
    const kinds = new Set(sim.tripSamples.map((s) => s.purpose));
    expect(kinds.has('work')).toBe(true);
    expect(kinds.has('shop')).toBe(true);
    expect(kinds.has('freight') || kinds.has('export') || kinds.has('import')).toBe(true);
  });

  it('visible trips follow connected roads from one building to another', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH * 2);
    expect(sim.tripSamples.length).toBeGreaterThan(20);
    const at = (seg: number, s: number) => sim.net.curve(seg).pointAt(s);
    for (const trip of sim.tripSamples) {
      expect(trip.legs.length).toBeGreaterThan(0);
      for (let i = 1; i < trip.legs.length; i++) {
        const a = trip.legs[i - 1]!;
        const b = trip.legs[i]!;
        const pa = at(a.seg, a.s1);
        const pb = at(b.seg, b.s0);
        expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeLessThan(1);
      }
      if (trip.purpose === 'work' || trip.purpose === 'shop') {
        const from = sim.state.buildings.get(trip.from)!;
        const acc = sim.buildingAccess(from)!;
        expect(trip.legs[0]!.seg).toBe(acc.seg);
        expect(trip.legs[0]!.s0).toBeCloseTo(acc.s, 3);
      }
    }
  });

  it('saves keep the traffic exactly', () => {
    const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
    sim.testMode = true;
    buildTown(sim);
    serveTown(sim);
    sim.advance(TICKS_PER_MONTH + 331);
    const loaded = Sim.fromSave(JSON.parse(JSON.stringify(sim.save())));
    expect(loaded.hash()).toBe(sim.hash());
    sim.advance(TICKS_PER_HOUR * 7);
    loaded.advance(TICKS_PER_HOUR * 7);
    expect(loaded.hash()).toBe(sim.hash());
  });
});
