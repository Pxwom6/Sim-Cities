import { describe, expect, it } from 'vitest';
import { advise, type Advice } from '../src/sim/systems/advisors';
import { TICKS_PER_MONTH } from '../src/sim/time';
import { buildTown, newSim, serveTown } from './helpers';
import { twoDistricts } from './trafficTown';
import { windStreet } from './envTown';

const find = (list: Advice[], advisor: Advice['advisor'], re: RegExp) =>
  list.find((a) => a.advisor === advisor && re.test(a.title));

describe('advisors', () => {
  it('spot missing utilities and services, and say where', () => {
    const sim = newSim();
    buildTown(sim);
    sim.advance(TICKS_PER_MONTH);
    const list = advise(sim);
    const power = find(list, 'utilities', /without power/i)!;
    expect(power).toBeDefined();
    expect(power.severity).toBeGreaterThanOrEqual(2);
    expect(power.map).toBe('power');
    // The location is in the middle of the affected buildings.
    const near = [...sim.state.buildings.values()].some(
      (b) => Math.hypot(b.x - power.at!.x, b.z - power.at!.z) < 200,
    );
    expect(near).toBe(true);
    expect(list[0]!.severity).toBe(3);
    // Sorted most urgent first.
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.severity).toBeLessThanOrEqual(list[i - 1]!.severity);
  });

  it('a served town hears about safety, health and schools until it has them', () => {
    const sim = newSim();
    buildTown(sim);
    serveTown(sim, false);
    sim.advance(TICKS_PER_MONTH * 2);
    const list = advise(sim);
    expect(find(list, 'utilities', /all supplied/i)).toBeDefined();
    expect(find(list, 'safety', /beyond fire cover/i)).toBeDefined();
    expect(find(list, 'health', /far from health care/i)).toBeDefined();
    expect(find(list, 'education', /without a school place/i)).toBeDefined();
    // Every advisor speaks.
    for (const a of [
      'finance',
      'utilities',
      'safety',
      'health',
      'education',
      'transport',
      'environment',
    ] as const)
      expect(list.some((x) => x.advisor === a)).toBe(true);
  });

  it('the transport advisor points at the jam', () => {
    const sim = newSim();
    const t = twoDistricts(sim, 'dirt');
    sim.advance(TICKS_PER_MONTH * 5);
    const jam = find(advise(sim), 'transport', /jam/i)!;
    expect(jam).toBeDefined();
    expect(sim.net.curve(t.link).project(jam.at!).d).toBeLessThan(5);
    expect(jam.map).toBe('traffic');
  });

  it('the environment advisor finds the smog downwind', () => {
    const sim = newSim();
    const t = windStreet(sim);
    sim.advance(TICKS_PER_MONTH * 4);
    const smog = find(advise(sim), 'environment', /smog/i);
    expect(smog).toBeDefined();
    expect(smog!.at!.z).toBeGreaterThan(t.mid.z);
    expect(smog!.map).toBe('airPollution');
  });
});
