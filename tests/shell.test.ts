import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/client/settings';
import { DIFFICULTY } from '../src/data/economy';
import { monthlyRates } from '../src/sim/systems/economy';
import { TICKS_PER_MONTH } from '../src/sim/time';
import { buildTown, newSim, serveTown } from './helpers';

describe('settings', () => {
  it('fall back to defaults field by field for missing, damaged or out-of-range values', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings({
      masterVolume: 3,
      effectsVolume: -1,
      ambientVolume: 'loud',
      quality: 'ultra',
      drawDistance: 'far',
      uiScale: 9,
      shadows: 0,
      autosaveMinutes: 7,
      seenTips: ['noPower', 4, 'money'],
      tutorialStep: 2,
    });
    expect(s.masterVolume).toBe(1);
    expect(s.effectsVolume).toBe(0);
    expect(s.ambientVolume).toBe(DEFAULT_SETTINGS.ambientVolume);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.drawDistance).toBe('far');
    expect(s.uiScale).toBe(1.4);
    expect(s.shadows).toBe(true);
    expect(s.autosaveMinutes).toBe(DEFAULT_SETTINGS.autosaveMinutes);
    expect(s.seenTips).toEqual(['noPower', 'money']);
    expect(s.tutorialStep).toBe(2);
  });

  it('round-trip through JSON unchanged', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      quality: 'low' as const,
      uiScale: 1.2,
      edgeScroll: true,
      autosaveMinutes: 10,
      seenTips: ['jobs'],
    };
    expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('difficulty', () => {
  it('sets starting money and scales upkeep; the ledger still balances to the dollar', () => {
    const ledger = (sim: ReturnType<typeof newSim>) => {
      const e = sim.state.economy;
      const sum = (lines: Record<string, number>) => Object.values(lines).reduce((a, v) => a + v, 0);
      return sum(e.month) + e.history.reduce((a, m) => a + sum(m.lines), 0);
    };
    const upkeep = (d: 'easy' | 'normal' | 'hard') => {
      const sim = newSim({ difficulty: d });
      expect(sim.state.treasury).toBe(DIFFICULTY[d].funds);
      buildTown(sim);
      serveTown(sim);
      const costs = Object.entries(monthlyRates(sim))
        .filter(([k]) => k === 'roadUpkeep' || k.startsWith('upkeep:'))
        .reduce((a, [, v]) => a + v, 0);
      // Over a month, the treasury moves by exactly what the ledger books.
      const t0 = sim.state.treasury;
      const l0 = ledger(sim);
      sim.advance(TICKS_PER_MONTH);
      expect(sim.state.treasury - t0).toBe(ledger(sim) - l0);
      return -costs;
    };
    // The same town costs more to run on harder settings.
    const normal = upkeep('normal');
    expect(upkeep('easy') / normal).toBeCloseTo(DIFFICULTY.easy.upkeep, 5);
    expect(upkeep('hard') / normal).toBeCloseTo(DIFFICULTY.hard.upkeep, 5);
  });
});
