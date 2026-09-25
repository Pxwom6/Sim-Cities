import type { SimClient } from './client/simClient';
import type { ClientWorld } from './client/world';
import type { GameRenderer } from './render/renderer';
import type { CameraPresetName, CameraPose } from './render/camera';
import type { Command, CommandResult } from './sim/commands';
import type { WorkerPerf } from './sim/protocol';
import { SPEED_TICKS_PER_SECOND, type Speed } from './sim/time';
import { ToolManager } from './tools/manager';
import type { ToolHint } from './tools/tool';

/** Minimal audio interface (procedural audio arrives in M8). */
export interface AudioSink {
  play(name: 'build' | 'zone' | 'bulldoze' | 'error' | 'click' | 'alert'): void;
}

type Listener = () => void;

/** Main-thread game glue: owns the client, mirror and renderer; the UI and tools talk to this. */
export class Game {
  speed: Speed = 1;
  perf: WorkerPerf = { tickMsAvg: 0, tickMsMax: 0, ticksPerSecond: 0, droppedTicks: 0 };
  fps = 0;
  frameMs = 0;
  debugOpen = false;
  hint: ToolHint | null = null;
  /** Open side panel (budget, and later data maps, advisors...). */
  panel: 'budget' | null = null;
  /** Currently inspected building. */
  selected: number | null = null;
  toasts: { id: number; text: string; tone: 'info' | 'ok' | 'bad' }[] = [];
  private toastId = 1;
  audio: AudioSink | null = null;
  readonly tools: ToolManager;
  private listeners = new Set<Listener>();
  private lastFrameAt = 0;

  constructor(
    readonly client: SimClient,
    readonly world: ClientWorld,
    readonly renderer: GameRenderer,
  ) {
    client.onFrame((diff, perf, speed) => {
      this.world.applyFrame(diff);
      if (this.selected !== null && diff.buildings) {
        if (diff.buildings.removed.includes(this.selected)) this.select(null);
        else if (diff.buildings.upserts.some((b) => b.id === this.selected)) this.select(this.selected);
      }
      this.perf = perf;
      this.speed = speed;
      // Keep the smooth display clock close to the authoritative tick.
      if (Math.abs(this.world.displayTick - diff.tick) > 30 || speed === 0)
        this.world.displayTick = diff.tick;
      this.notify();
    });
    this.tools = new ToolManager(this);
    renderer.controller.focus = () => {
      const hw = this.world.gen.params.highway;
      return { x: 260, z: hw.connectZ };
    };
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  notify(): void {
    this.listeners.forEach((l) => l());
  }

  dispatch(cmd: Command): Promise<CommandResult> {
    return this.client.command(cmd);
  }

  openPanel(p: Game['panel']): void {
    this.panel = this.panel === p ? null : p;
    this.notify();
  }

  select(id: number | null): void {
    this.selected = id;
    const b = id !== null ? this.world.buildings.get(id) : undefined;
    this.renderer.ghost.showSelection(
      b ? { x: b.x, z: b.z, hw: b.w * 4, hd: b.d * 4, angle: b.angle } : null,
    );
    this.notify();
  }

  toast(text: string, tone: 'info' | 'ok' | 'bad' = 'info', ms = 3500): void {
    const id = this.toastId++;
    this.toasts = [...this.toasts, { id, text, tone }].slice(-4);
    this.notify();
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.notify();
    }, ms);
  }

  setHint(h: ToolHint | null): void {
    if (!h && !this.hint) return;
    this.hint = h;
    this.notify();
  }

  async undo(): Promise<CommandResult> {
    const r = await this.dispatch({ type: 'undo' });
    if (!r.ok)
      this.setHint({ x: window.innerWidth / 2, y: window.innerHeight - 140, text: r.reason, tone: 'bad' });
    return r;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.client.setSpeed(speed);
    this.notify();
  }

  setCamera(preset: CameraPresetName | Partial<CameraPose>, instant = true): void {
    if (typeof preset === 'string') this.renderer.controller.preset(preset, instant);
    else this.renderer.controller.setPose(preset, instant);
  }

  toggleDebug(): void {
    this.debugOpen = !this.debugOpen;
    this.notify();
  }

  /** Called every animation frame. */
  frame(now: number): void {
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 1 / 60;
    this.lastFrameAt = now;
    this.fps = this.fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;
    const t0 = performance.now();
    const w = this.world;
    if (this.speed > 0) {
      const next = w.displayTick + dt * SPEED_TICKS_PER_SECOND[this.speed];
      w.displayTick = Math.min(next, w.stats.tick + 8);
    }
    this.renderer.frame(dt);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }
}
