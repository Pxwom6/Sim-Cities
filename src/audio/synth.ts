/**
 * Small Web Audio building blocks. Everything takes a BaseAudioContext so the same recipes play
 * live and render offline (tests measure the offline render).
 */

export type NoiseColour = 'white' | 'pink' | 'brown';

const noiseCache = new WeakMap<BaseAudioContext, Map<NoiseColour, AudioBuffer>>();

/** Two seconds of looping noise, generated once per context. */
export function noise(ctx: BaseAudioContext, colour: NoiseColour): AudioBuffer {
  let m = noiseCache.get(ctx);
  if (!m) noiseCache.set(ctx, (m = new Map()));
  const hit = m.get(colour);
  if (hit) return hit;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // A fixed LCG keeps the texture identical between runs (and across live/offline renders).
  let seed = 0x2545f491;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    last = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd();
    if (colour === 'white') d[i] = w * 0.5;
    else if (colour === 'pink') {
      // Paul Kellet's economy pink filter.
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
  }
  // Crossfade the ends so the loop has no click.
  const fade = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i]! * (1 - k) + d[i]! * k;
  }
  m.set(colour, buf);
  return buf;
}

/** Attack/decay envelope on a gain param: silent → peak over `a` s → silent over `d` s. */
export function envelope(p: AudioParam, t: number, peak: number, a: number, d: number): void {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(a, 0.002));
  p.exponentialRampToValueAtTime(0.0001, t + a + d);
}

export interface ToneOpts {
  type?: OscillatorType;
  /** Start and end frequency (Hz); the sweep is exponential. */
  f0: number;
  f1?: number;
  gain: number;
  attack?: number;
  dur: number;
  /** Low-pass cutoff, if any. */
  lp?: number;
}

/** A single enveloped oscillator note. Returns when it ends. */
export function tone(ctx: BaseAudioContext, out: AudioNode, t: number, o: ToneOpts): number {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = ctx.createGain();
  const a = o.attack ?? 0.005;
  envelope(g.gain, t, o.gain, a, o.dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + a + o.dur + 0.05);
  return t + a + o.dur;
}

export interface BurstOpts {
  colour?: NoiseColour;
  filter?: BiquadFilterType;
  /** Filter frequency at the start and end (Hz). */
  f0: number;
  f1?: number;
  q?: number;
  gain: number;
  attack?: number;
  dur: number;
}

/** An enveloped, filtered noise burst. Returns when it ends. */
export function burst(ctx: BaseAudioContext, out: AudioNode, t: number, o: BurstOpts): number {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, o.colour ?? 'white');
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = ctx.createGain();
  const a = o.attack ?? 0.004;
  envelope(g.gain, t, o.gain, a, o.dur);
  src.connect(f).connect(g).connect(out);
  // Start at a varying offset so repeated bursts don't sound identical.
  src.start(t, (t * 7.31) % 1.5);
  src.stop(t + a + o.dur + 0.05);
  return t + a + o.dur;
}
