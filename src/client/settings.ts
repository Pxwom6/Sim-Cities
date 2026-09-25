/**
 * Player settings, kept in localStorage (they're per device, not per city). The game shell (M11)
 * adds graphics and control options to the same record.
 */
export interface Settings {
  /** Volumes, 0–1. */
  masterVolume: number;
  effectsVolume: number;
  ambientVolume: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  effectsVolume: 0.8,
  ambientVolume: 0.6,
  muted: false,
};

const KEY = 'citybloom.settings';

function clamp01(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;
}

/** Read settings, falling back to defaults field by field (older or damaged records still load). */
export function loadSettings(): Settings {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const d = DEFAULT_SETTINGS;
  return {
    masterVolume: clamp01(raw.masterVolume, d.masterVolume),
    effectsVolume: clamp01(raw.effectsVolume, d.effectsVolume),
    ambientVolume: clamp01(raw.ambientVolume, d.ambientVolume),
    muted: typeof raw.muted === 'boolean' ? raw.muted : d.muted,
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage full: settings just won't persist.
  }
}
