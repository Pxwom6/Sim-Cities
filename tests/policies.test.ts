import { describe, expect, it } from 'vitest';
import type { Sim } from '../src/sim/sim';
import { BState } from '../src/sim/world/buildings';
import { POLICIES, POLICY_EFFECTS, policyCost } from '../src/data/policies';
import { garbageRate } from '../src/sim/systems/garbage';
import { sicknessRate } from '../src/sim/systems/health';
import { crimeRisk, fireRisk } from '../src/sim/systems/incidents';
import { unlockedDensity } from '../src/sim/systems/growth';
import { TICKS_PER_HOUR, TICKS_PER_MONTH } from '../src/sim/time';
import { buildTown, newSim, serveTown } from './helpers';
import { twoDistricts } from './trafficTown';

function town(policies: string[] = [], services = true): Sim {
  const sim = newSim();
  buildTown(sim);
  serveTown(sim, services);
  for (const id of policies) {
    const r = sim.dispatch({ type: 'setPolicy', id: id as never, on: true });
    if (!r.ok) throw new Error(r.reason);
  }
  return sim;
}

describe('policies', () => {
  it('cost money every month, and only once unlocked', () => {
    const sim = newSim();
    buildTown(sim);
    expect(sim.dispatch({ type: 'setPolicy', id: 'tourismCampaign', on: true }).ok).toBe(false);
    sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
    expect(sim.dispatch({ type: 'setPolicy', id: 'fireSafety', on: true }).ok).toBe(true);
    sim.advance(TICKS_PER_MONTH);
    const e = sim.state.economy;
    const spent = (e.month.policies ?? 0) + e.history.reduce((a, m) => a + (m.lines.policies ?? 0), 0);
    expect(spent).toBeLessThan(0);
    const expected = policyCost(
      POLICIES.find((p) => p.id === 'fireSafety')!,
      sim.state.totals.population,
    );
    expect(-spent).toBeGreaterThan(expected * 0.3);
    expect(sim.dispatch({ type: 'setPolicy', id: 'fireSafety', on: false }).ok).toBe(true);
    expect(sim.state.policies).toEqual([]);
  });

  it('home fire safety halves outbreaks', () => {
    const without = town();
    const withIt = town(['fireSafety']);
    without.advance(TICKS_PER_MONTH);
    withIt.advance(TICKS_PER_MONTH);
    // The risk itself halves for every building...
    for (const b of [...withIt.state.buildings.values()].slice(0, 20)) {
      const on = fireRisk(withIt, b);
      withIt.state.policies = [];
      expect(on).toBeCloseTo(fireRisk(withIt, b) * 0.5, 9);
      withIt.state.policies = ['fireSafety'];
    }
    // ...and over a year the expected number of outbreaks across the whole town is far lower.
    const expected = (sim: Sim) => {
      let e = 0;
      for (let h = 0; h < 24 * 12; h++) {
        sim.advance(TICKS_PER_HOUR);
        for (const b of sim.state.buildings.values())
          if ((b.state === BState.Active || b.state === BState.Abandoned) && b.fire <= 0)
            e += fireRisk(sim, b);
      }
      return e;
    };
    const a = expected(without);
    const b = expected(withIt);
    expect(a).toBeGreaterThan(1);
    expect(b).toBeLessThan(a * 0.6);
  });

  it('neighbourhood watch cuts crime', () => {
    const without = town([], false);
    const withIt = town(['neighbourhoodWatch'], false);
    without.advance(TICKS_PER_MONTH);
    withIt.advance(TICKS_PER_MONTH);
    // The chance of a crime falls by a quarter at every home and shop...
    const homes = [...withIt.state.buildings.values()].filter((b) => b.state === BState.Active && b.pop > 0);
    expect(homes.length).toBeGreaterThan(20);
    for (const b of homes.slice(0, 20)) {
      const on = crimeRisk(withIt, b);
      withIt.state.policies = [];
      expect(on).toBeCloseTo(crimeRisk(withIt, b) * POLICY_EFFECTS.neighbourhoodWatch, 9);
      withIt.state.policies = ['neighbourhoodWatch'];
    }
    // ...and over half a year the expected number of crimes across the whole town is far lower
    // (summing the hourly risk rather than counting rolls keeps chance out of it).
    const expected = (sim: Sim) => {
      let e = 0;
      for (let h = 0; h < 24 * 6; h++) {
        sim.advance(TICKS_PER_HOUR);
        for (const b of sim.state.buildings.values()) if (b.state === BState.Active) e += crimeRisk(sim, b);
      }
      return e;
    };
    const a = expected(without);
    const b = expected(withIt);
    expect(a).toBeGreaterThan(4);
    expect(b).toBeLessThan(a * 0.85);
  });

  it('recycling cuts garbage, healthy living cuts sickness, the ban stops towers', () => {
    const sim = town();
    sim.advance(TICKS_PER_MONTH);
    const homes = [...sim.state.buildings.values()].filter((b) => b.state === BState.Active && b.pop > 0);
    const g0 = homes.reduce((a, b) => a + garbageRate(sim, b), 0);
    const s0 = homes.reduce((a, b) => a + sicknessRate(sim, b), 0);
    // As if the city had once reached 6,000 residents: towers are unlocked.
    sim.state.progress.peak = 6_000;
    expect(unlockedDensity(sim)).toBe(2);
    for (const id of ['recycling', 'healthyLiving', 'highRiseBan'] as const)
      expect(sim.dispatch({ type: 'setPolicy', id, on: true }).ok).toBe(true);
    const g1 = homes.reduce((a, b) => a + garbageRate(sim, b), 0);
    const s1 = homes.reduce((a, b) => a + sicknessRate(sim, b), 0);
    expect(g1).toBeCloseTo(g0 * 0.75, 3);
    expect(s1).toBeCloseTo(s0 * 0.7, 6);
    expect(unlockedDensity(sim)).toBe(1);
  });

  it('clean industry grants cut industrial pollution', () => {
    const run = (clean: boolean) => {
      const sim = town(clean ? ['cleanIndustry'] : []);
      sim.advance(TICKS_PER_MONTH * 3);
      const sum = (f: Float32Array) => f.reduce((a, v) => a + v, 0);
      return sum(sim.state.groundPollution) + sum(sim.state.airPollution);
    };
    const dirty = run(false);
    const clean = run(true);
    expect(dirty).toBeGreaterThan(0);
    expect(clean).toBeLessThan(dirty * 0.95);
  });

  it('free buses bring more riders', () => {
    const riders = (free: boolean) => {
      const sim = newSim();
      const t = twoDistricts(sim, 'dirt');
      sim.advance(TICKS_PER_MONTH * 5);
      t.buses();
      if (free) {
        sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
        expect(sim.dispatch({ type: 'setPolicy', id: 'freeTransit', on: true }).ok).toBe(true);
      }
      sim.advance(TICKS_PER_MONTH * 2 + TICKS_PER_HOUR);
      return [...sim.state.transit.riders.values()].reduce((a, b) => a + b, 0);
    };
    const paid = riders(false);
    const free = riders(true);
    expect(paid).toBeGreaterThan(100);
    expect(free).toBeGreaterThan(paid * 1.15);
  });
});
