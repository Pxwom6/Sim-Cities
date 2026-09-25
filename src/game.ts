import type { SimClient } from './client/simClient';
import type { ClientWorld } from './client/world';
import type { GameRenderer } from './render/renderer';
import type { CameraPresetName, CameraPose } from './render/camera';
import type { Command, CommandResult } from './sim/commands';
import type { WorkerPerf } from './sim/protocol';
import { SPEED_TICKS_PER_SECOND, type Speed } from './sim/time';
import { ToolManager } from './tools/manager';
import { CIVIC } from './data/civic';
import type { Advice } from './sim/systems/advisors';
import { OverlayController } from './client/overlay';
import { StreetNames } from './client/names';
import { StreetLabels } from './client/labels';
import type { ToolHint } from './tools/tool';
import type { AudioEngine } from './audio/engine';
import { ambientScene } from './audio/scene';
import { loadSettings, saveSettings, type Settings } from './client/settings';

type Listener = () => void;

/** Something the player has clicked on and is inspecting. */
export interface Selection {
  kind: 'building' | 'civic' | 'car' | 'walker';
  id: number;
}

/** An entry in the notification log. */
export interface Notice {
  id: number;
  kind: string;
  text: string;
  tone: 'info' | 'ok' | 'bad';
  at?: { x: number; z: number };
  count: number;
  /** performance.now() of the latest occurrence, and the sim tick. */
  time: number;
  tick: number;
}

/** Main-thread game glue: owns the client, mirror and renderer; the UI and tools talk to this. */
export class Game {
  speed: Speed = 1;
  perf: WorkerPerf = { tickMsAvg: 0, tickMsMax: 0, ticksPerSecond: 0, droppedTicks: 0 };
  fps = 0;
  frameMs = 0;
  debugOpen = false;
  hint: ToolHint | null = null;
  /** Open side panel (budget, and later data maps, advisors...). */
  panel: 'budget' | 'advisors' | 'notifications' | null = null;
  /** Street and neighbourhood names, and their labels on the map. */
  readonly names: StreetNames;
  readonly labels: StreetLabels;
  /** Latest advice from every advisor (refreshed every couple of seconds). */
  advice: Advice[] = [];
  /** Currently inspected building. */
  selected: Selection | null = null;
  toasts: { id: number; text: string; tone: 'info' | 'ok' | 'bad'; at?: { x: number; z: number } }[] = [];
  /** Notification log, newest first (prioritised when shown). */
  notifications: Notice[] = [];
  private noticeId = 1;
  private toastId = 1;
  audio: AudioEngine | null = null;
  /** Player settings (volumes now; graphics and controls with the game shell). */
  settings: Settings = loadSettings();
  private ambientAt = 0;
  readonly tools: ToolManager;
  readonly overlay: OverlayController;
  private listeners = new Set<Listener>();
  private lastFrameAt = 0;

  constructor(
    readonly client: SimClient,
    readonly world: ClientWorld,
    readonly renderer: GameRenderer,
  ) {
    client.onFrame((diff, perf, speed) => {
      this.world.applyFrame(diff);
      if (diff.events) this.onEvents(diff.events);
      const sel = this.selected;
      if (sel?.kind === 'building' && diff.buildings) {
        if (diff.buildings.removed.includes(sel.id)) this.select(null);
        else if (diff.buildings.upserts.some((b) => b.id === sel.id)) this.select(sel);
      }
      if (sel?.kind === 'civic' && diff.civics?.removed.includes(sel.id)) this.select(null);
      this.perf = perf;
      this.speed = speed;
      // Keep the smooth display clock close to the authoritative tick.
      if (Math.abs(this.world.displayTick - diff.tick) > 30 || speed === 0)
        this.world.displayTick = diff.tick;
      this.notify();
    });
    this.names = new StreetNames(world);
    this.labels = new StreetLabels(this);
    this.tools = new ToolManager(this);
    this.overlay = new OverlayController(this);
    renderer.controller.focus = () => {
      const hw = this.world.gen.params.highway;
      return { x: 260, z: hw.connectZ };
    };
    renderer.tiltShiftOn = this.settings.tiltShift;
    void this.refreshAdvice();
    setInterval(() => void this.refreshAdvice(), 2000);
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

  select(sel: Selection | null): void {
    this.selected = sel;
    let rect: { x: number; z: number; hw: number; hd: number; angle: number } | null = null;
    // A selected car shows its whole route; a selected depot shows its bus loop.
    const car =
      sel?.kind === 'car'
        ? this.renderer.traffic.car(sel.id)
        : sel?.kind === 'walker'
          ? this.renderer.pedestrians.walker(sel.id)
          : undefined;
    const line = sel?.kind === 'civic' ? this.world.lines.find((l) => l.depot === sel.id) : undefined;
    const legs = car?.legs ?? line?.legs;
    const net = this.world.net;
    this.renderer.routeTint.show(
      legs
        ? [...new Set(legs.map((l) => l.seg))]
            .filter((id) => this.world.netState.segments.has(id))
            .map((id) => ({ curve: net.curve(id), v: [1, 1], half: 2.5 }))
        : null,
    );
    if (sel?.kind === 'building') {
      const b = this.world.buildings.get(sel.id);
      if (b) rect = { x: b.x, z: b.z, hw: b.w * 4, hd: b.d * 4, angle: b.angle };
    } else if (sel?.kind === 'civic') {
      const c = this.world.civics.get(sel.id);
      const d = c ? CIVIC.get(c.def) : undefined;
      if (c && d) rect = { x: c.x, z: c.z, hw: d.w / 2, hd: d.d / 2, angle: c.angle };
    }
    this.renderer.ghost.showSelection(rect);
    this.notify();
  }

  toast(text: string, tone: 'info' | 'ok' | 'bad' = 'info', ms = 3500, at?: { x: number; z: number }): void {
    const id = this.toastId++;
    this.toasts = [...this.toasts, { id, text, tone, at }].slice(-4);
    this.notify();
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.notify();
    }, ms);
  }

  private lastAlert = new Map<string, number>();

  /** Where an event happened (its building or civic building), for flying the camera there. */
  private placeOf(id: number): { x: number; z: number } | undefined {
    const b = this.world.buildings.get(id) ?? this.world.civics.get(id);
    return b ? { x: b.x, z: b.z } : undefined;
  }

  /** Log a notification (repeats of the same kind collapse) and toast it unless one just showed. */
  notice(
    kind: string,
    text: string,
    tone: 'info' | 'ok' | 'bad',
    at?: { x: number; z: number },
    toast = true,
  ): void {
    const now = performance.now();
    const head = this.notifications.find((n) => n.kind === kind && now - n.time < 60_000);
    if (head) {
      head.count++;
      head.time = now;
      head.tick = this.world.stats.tick;
      if (at) head.at = at;
    } else {
      this.notifications = [
        { id: this.noticeId++, kind, text, tone, at, count: 1, time: now, tick: this.world.stats.tick },
        ...this.notifications,
      ].slice(0, 60);
    }
    if (toast && now - (this.lastAlert.get(kind) ?? -1e9) >= 20_000) {
      this.lastAlert.set(kind, now);
      this.toast(text, tone, 5000, at);
      this.audio?.play(tone === 'bad' ? 'alert' : tone === 'ok' ? 'good' : 'click');
    }
    this.notify();
  }

  private lastAdviceKeys = new Set<string>();

  /** Turn sim events into notifications (DESIGN §5). */
  private onEvents(events: { kind: string; id: number }[]): void {
    for (const e of events) {
      const at = this.placeOf(e.id);
      if (e.kind === 'closed')
        this.notice('closed', 'A business closed: no power or water for half a day.', 'bad', at);
      else if (e.kind === 'abandoned')
        this.notice('abandoned', 'A building was abandoned. Click it to see why.', 'bad', at);
      else if (e.kind === 'bankrupt') this.notice('bankrupt', 'The city is bankrupt.', 'bad');
      else if (e.kind === 'moneyNegative') this.notice('money', 'The treasury is empty!', 'bad');
      else if (e.kind === 'fire') {
        this.notice('fire', 'Fire! A building is burning.', 'bad', at);
        this.audio?.play('siren');
      } else if (e.kind === 'destroyed') this.notice('destroyed', 'A building burned down.', 'bad', at);
      else if (e.kind === 'fireOut') this.notice('fireOut', 'Firefighters put out a fire.', 'ok', at);
      else if (e.kind === 'crime')
        this.notice('crime', 'A crime went unanswered. Police coverage is thin.', 'bad', at);
      else if (e.kind === 'death')
        this.notice('death', 'An ambulance could not reach a patient in time.', 'bad', at);
      else if (e.kind === 'crimeStopped')
        this.notice('crimeStopped', 'Police stopped a crime.', 'ok', at, false);
      else if (e.kind === 'patientSaved')
        this.notice('patientSaved', 'An ambulance got a patient to care.', 'ok', at, false);
    }
  }

  /** Urgent advice becomes a notification the first time it appears. */
  private adviceNotices(): void {
    const keys = new Set<string>();
    for (const a of this.advice) {
      if (a.severity < 3) continue;
      const key = `${a.advisor}:${a.title.replace(/[0-9,]+/g, '#')}`;
      keys.add(key);
      if (!this.lastAdviceKeys.has(key)) this.notice(key, `${a.title}. ${a.text}`, 'bad', a.at);
    }
    this.lastAdviceKeys = keys;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.audio?.apply(this.settings);
    this.renderer.tiltShiftOn = this.settings.tiltShift;
    this.notify();
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

  /** Fly the camera to a spot (advisors, notifications), optionally opening a data map. */
  flyTo(at: { x: number; z: number }, map?: string): void {
    const cur = this.renderer.controller.goal;
    this.renderer.controller.setPose(
      {
        x: at.x,
        z: at.z,
        distance: Math.min(Math.max(cur.distance, 180), 320),
        yaw: cur.yaw,
        tilt: cur.tilt,
      },
      false,
    );
    if (map) this.overlay.set(map as never);
    this.notify();
  }

  async refreshAdvice(): Promise<void> {
    this.advice = await this.client.query<Advice[]>({ type: 'advisors' });
    this.adviceNotices();
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
    this.labels.update();
    if (this.audio && now - this.ambientAt > 250) {
      this.ambientAt = now;
      this.audio.update(ambientScene(w, this.renderer, this.speed === 0));
    }
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }
}
