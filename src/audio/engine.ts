import type { Settings } from '../client/settings';
import { AmbientBed } from './ambient';
import { ambientMix, type AmbientMix, type AmbientScene } from './mix';
import { SOUNDS, type SoundName } from './sounds';

/** Shortest gap between two plays of the same sound (s); sirens are rarer. */
const MIN_GAP: Partial<Record<SoundName, number>> = { siren: 6, alert: 1.5, error: 0.15 };

/**
 * Procedural audio: effects on demand and an ambient bed that follows the view. The browser only
 * allows audio after a user gesture, so the context is created on the first click or key press.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private amb: GainNode | null = null;
  private bed: AmbientBed | null = null;
  private last = new Map<SoundName, number>();
  /** Sounds actually scheduled, by name (tests and the debug panel read this). */
  readonly played: Partial<Record<SoundName, number>> = {};
  private unlock = () => this.start();

  constructor(private settings: Settings) {
    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    // Every button in the interface ticks softly.
    document.addEventListener(
      'click',
      (e) => {
        const el = e.target as HTMLElement | null;
        if (el?.closest?.('#ui button, #ui .clickable')) this.play('click');
      },
      true,
    );
  }

  /** Create the audio graph (idempotent); must run inside a user gesture the first time. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    this.bed = new AmbientBed(ctx, this.amb);
    this.apply(this.settings);
    window.removeEventListener('pointerdown', this.unlock, true);
    window.removeEventListener('keydown', this.unlock, true);
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Apply volume settings (squared, so the sliders feel even). */
  apply(s: Settings): void {
    this.settings = s;
    if (!this.ctx || !this.master || !this.sfx || !this.amb) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume ** 2, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.effectsVolume ** 2, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambientVolume ** 2, t, 0.05);
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || ctx.state !== 'running' || this.settings.muted) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.05;
    if (now - (this.last.get(name) ?? -1e9) < gap) return;
    this.last.set(name, now);
    SOUNDS[name](ctx, this.sfx, now + 0.01, Math.random());
    this.played[name] = (this.played[name] ?? 0) + 1;
  }

  /** Follow the view; call a few times a second. */
  update(scene: AmbientScene): void {
    if (!this.bed || !this.running) return;
    this.bed.setMix(ambientMix(scene));
    this.bed.tick();
  }

  /** Current ambient levels and scheduled event counts (for tests and the debug panel). */
  get ambient(): { mix: AmbientMix; events: AmbientBed['events'] } | null {
    return this.bed ? { mix: this.bed.levels, events: this.bed.events } : null;
  }
}
