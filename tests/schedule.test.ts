import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MatchRound } from '../src/sim/systems/commute';
import { HOURLY_AT, MATCH_SLICES, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../src/sim/time';
import { buildTown, newSim, serveTown } from './helpers';

function grownTown(): Sim {
  const sim = newSim();
  buildTown(sim);
  serveTown(sim);
  sim.advance(TICKS_PER_MONTH);
  return sim;
}

describe('schedule', () => {
  it('runs each hourly system once an hour at its minute, and matching over four ticks every other hour', () => {
    const sim = grownTown();
    const seen: { name: string; minute: number; hour: number }[] = [];
    sim.timer = (name, fn) => {
      fn();
      seen.push({
        name,
        minute: sim.state.tick % TICKS_PER_HOUR,
        hour: Math.floor(sim.state.tick / TICKS_PER_HOUR),
      });
    };
    sim.advance(TICKS_PER_HOUR * 6);
    const hourly = [
      'utilities',
      'coverage',
      'health',
      'garbage',
      'happiness',
      'lifecycle',
      'economy',
    ] as const;
    for (const name of hourly) {
      const runs = seen.filter((s) => s.name === name);
      expect(runs.length, name).toBe(6);
      expect(new Set(runs.map((r) => r.minute)), name).toEqual(new Set([HOURLY_AT[name]]));
    }
    const matcher = seen.filter((s) => s.name === 'matcher');
    expect(matcher.length).toBe(3 * MATCH_SLICES);
    expect(matcher.every((m) => m.hour % 2 === 0)).toBe(true);
    // No tick runs more than one of the heavy systems.
    const heavy = new Set([
      'utilities',
      'coverage',
      'garbage',
      'pollution',
      'matcher',
      'happiness',
      'landValue',
    ]);
    const perTick = new Map<string, number>();
    for (const s of seen)
      if (heavy.has(s.name))
        perTick.set(`${s.hour}:${s.minute}`, (perTick.get(`${s.hour}:${s.minute}`) ?? 0) + 1);
    expect(Math.max(...perTick.values())).toBe(1);
  });

  it('gives the same result however a matching round is sliced', () => {
    const a = grownTown();
    const b = Sim.fromSave(JSON.parse(JSON.stringify(a.save())));
    expect(b.hash()).toBe(a.hash());
    new MatchRound(a).finish();
    const r = new MatchRound(b);
    for (let k = 0; k < 7; k++) r.step(Math.ceil(r.size / 7));
    r.finish();
    expect(b.hash()).toBe(a.hash());
  });

  it('a save in the middle of a matching round loads and carries on identically', () => {
    const sim = grownTown();
    // Two ticks into a round (matching runs on even hours).
    let t = sim.state.tick;
    while (!(Math.floor(t / TICKS_PER_HOUR) % 2 === 0 && t % TICKS_PER_HOUR === HOURLY_AT.matcher + 1)) t++;
    sim.advance(t - sim.state.tick);
    const loaded = Sim.fromSave(JSON.parse(JSON.stringify(sim.save())));
    expect(loaded.hash()).toBe(sim.hash());
    sim.advance(TICKS_PER_HOUR * 3);
    loaded.advance(TICKS_PER_HOUR * 3);
    expect(loaded.hash()).toBe(sim.hash());
  });
});
