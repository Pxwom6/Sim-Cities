import { describe, expect, it } from 'vitest';
import { ambientMix, listenRadius, type AmbientScene } from '../src/audio/mix';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/client/settings';

const scene = (s: Partial<AmbientScene>): AmbientScene => ({
  distance: 150,
  cars: 0,
  buildings: 0,
  construction: 0,
  fires: 0,
  sirens: 0,
  trees: 0,
  night: 0,
  paused: false,
  tornado: Infinity,
  flood: 0,
  ...s,
});

describe('ambient mix', () => {
  it('a busy street is traffic and building work, not birdsong', () => {
    const m = ambientMix(scene({ cars: 40, buildings: 60, construction: 5, trees: 0.05 }));
    expect(m.traffic).toBeGreaterThan(0.8);
    expect(m.construction).toBeGreaterThan(0.8);
    expect(m.birds).toBeLessThan(0.05);
  });

  it('woods are birds by day and crickets by night', () => {
    const day = ambientMix(scene({ trees: 0.7 }));
    const night = ambientMix(scene({ trees: 0.7, night: 1 }));
    expect(day.traffic).toBe(0);
    expect(day.birds).toBeGreaterThan(0.5);
    expect(day.crickets).toBe(0);
    expect(night.crickets).toBeGreaterThan(0.5);
    expect(night.birds).toBe(0);
  });

  it('high above the city it is mostly wind', () => {
    const near = ambientMix(scene({ cars: 30, buildings: 40 }));
    const far = ambientMix(scene({ cars: 30, buildings: 40, distance: 2200 }));
    expect(far.wind).toBeGreaterThan(near.wind);
    expect(far.traffic).toBeLessThan(near.traffic * 0.2);
    expect(listenRadius(2200)).toBeGreaterThan(listenRadius(150));
  });

  it('pausing stops traffic and building work; fires and sirens are heard', () => {
    const m = ambientMix(scene({ cars: 40, construction: 4, paused: true, fires: 2 }));
    expect(m.traffic).toBe(0);
    expect(m.construction).toBe(0);
    expect(m.fire).toBeGreaterThan(0.5);
    expect(ambientMix(scene({ sirens: 2 })).sirens).toBeGreaterThan(0.5);
    for (const v of Object.values(ambientMix(scene({ cars: 1e6, trees: 5, fires: 99, night: 3 }))))
      expect(v).toBeLessThanOrEqual(1);
  });
});

describe('settings', () => {
  it('persist, and damaged records fall back to defaults field by field', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, masterVolume: 0.3, muted: true });
    expect(loadSettings().masterVolume).toBe(0.3);
    expect(loadSettings().muted).toBe(true);
    store.set('citybloom.settings', JSON.stringify({ masterVolume: 'loud', effectsVolume: 7 }));
    const s = loadSettings();
    expect(s.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(s.effectsVolume).toBe(1);
    store.set('citybloom.settings', '{nope');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
