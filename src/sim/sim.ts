import { fnv1a } from './hash';
import { Rng } from './rng';
import { fail, ok, type Command, type CommandLogEntry, type CommandResult } from './commands';
import { RNG_STREAMS, DEFAULT_OPTIONS, type GameOptions, type RngStream, type SimState } from './state';
import { Terrain } from './terrain/terrain';
import { SAVE_VERSION, makeSaveFile, readSaveFile, stateToCanonicalJson, type SaveFile } from './save';
import type { CityStats, FrameDiff, Snapshot } from './protocol';
import { checkInvariants } from './invariants';

export const STARTING_FUNDS = { easy: 100_000, normal: 60_000, hard: 35_000 } as const;
const SANDBOX_FUNDS = 999_999_999;

/**
 * The simulation. Pure TypeScript, deterministic, runs in the worker and headlessly in tests.
 * All mutation goes through `dispatch` (commands) and `step` (one fixed tick).
 */
export class Sim {
  state: SimState;
  readonly terrain: Terrain;
  readonly rng: Record<RngStream, Rng>;
  /** Every applied command with the tick it was applied at (for replays). Not part of the hash. */
  readonly log: CommandLogEntry[] = [];
  /** When true, invariants are checked after every tick and violations throw. */
  testMode = false;

  private dirtyTrees = new Set<number>();

  private constructor(state: SimState, terrain: Terrain) {
    this.state = state;
    this.terrain = terrain;
    this.rng = {} as Record<RngStream, Rng>;
    for (const s of RNG_STREAMS) this.rng[s] = new Rng(state.rng[s]);
  }

  static create(opts: Partial<GameOptions> = {}): Sim {
    const options: GameOptions = { ...DEFAULT_OPTIONS, ...opts };
    const terrain = new Terrain(options.seed, options.preset);
    const rng = {} as SimState['rng'];
    for (const s of RNG_STREAMS) rng[s] = Rng.fromSeed(`${options.seed}:${s}`).getState();
    const state: SimState = {
      version: SAVE_VERSION,
      options,
      tick: 0,
      rng,
      treasury: options.sandbox ? SANDBOX_FUNDS : STARTING_FUNDS[options.difficulty],
      cityName: options.cityName,
      trees: terrain.initialTrees.slice(),
    };
    return new Sim(state, terrain);
  }

  static fromSave(save: SaveFile): Sim {
    const state = readSaveFile(save);
    const terrain = new Terrain(state.options.seed, state.options.preset);
    return new Sim(state, terrain);
  }

  get tick(): number {
    return this.state.tick;
  }

  // ---------------------------------------------------------------- commands

  dispatch(cmd: Command): CommandResult {
    const result = this.apply(cmd, false);
    if (result.ok) this.log.push({ tick: this.state.tick, cmd: structuredCloneSafe(cmd) });
    return result;
  }

  /** Dry run: validity and cost without changing any state. */
  preview(cmd: Command): CommandResult {
    return this.apply(cmd, true);
  }

  private apply(cmd: Command, dryRun: boolean): CommandResult {
    switch (cmd.type) {
      case 'cheat': {
        if (!Number.isFinite(cmd.amount)) return fail('Invalid amount');
        if (!dryRun) this.state.treasury += Math.round(cmd.amount);
        return ok(0);
      }
      case 'renameCity': {
        const name = cmd.name.trim().slice(0, 40);
        if (!name) return fail('Name cannot be empty');
        if (!dryRun) this.state.cityName = name;
        return ok(0);
      }
      default: {
        const never: never = cmd;
        return fail(`Unknown command ${(never as { type: string }).type}`);
      }
    }
  }

  // ---------------------------------------------------------------- time

  step(): void {
    this.state.tick++;
    if (this.testMode) checkInvariants(this);
  }

  advance(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** Re-run a command log from a fresh sim: apply each entry at its tick. */
  static replay(opts: Partial<GameOptions>, log: CommandLogEntry[], untilTick: number): Sim {
    const sim = Sim.create(opts);
    let i = 0;
    for (;;) {
      while (i < log.length && log[i]!.tick === sim.tick) sim.dispatch(log[i++]!.cmd);
      if (sim.tick >= untilTick) break;
      sim.step();
    }
    return sim;
  }

  // ---------------------------------------------------------------- persistence

  private syncRng(): void {
    for (const s of RNG_STREAMS) this.state.rng[s] = this.rng[s].getState();
  }

  save(savedAt = ''): SaveFile {
    this.syncRng();
    return makeSaveFile(this.state, this.stats().population, savedAt);
  }

  hash(): string {
    this.syncRng();
    return fnv1a(stateToCanonicalJson(this.state));
  }

  // ---------------------------------------------------------------- views for the main thread

  stats(): CityStats {
    return {
      tick: this.state.tick,
      treasury: this.state.treasury,
      cityName: this.state.cityName,
      population: 0,
    };
  }

  snapshot(): Snapshot {
    return {
      options: { ...this.state.options },
      terrainParams: this.terrain.gen.params,
      heights: this.terrain.heights.slice(),
      trees: this.state.trees.slice(),
      groundwater: this.terrain.groundwater.slice(),
      ore: this.terrain.ore.slice(),
      oil: this.terrain.oil.slice(),
      stats: this.stats(),
    };
  }

  /** Changes since the last call, for the main-thread mirror. */
  collectFrame(): FrameDiff {
    const frame: FrameDiff = { tick: this.state.tick, stats: this.stats() };
    if (this.dirtyTrees.size) {
      const idx = [...this.dirtyTrees].sort((a, b) => a - b);
      frame.trees = { idx, val: idx.map((i) => this.state.trees[i]!) };
      this.dirtyTrees.clear();
    }
    return frame;
  }

  markTreesDirty(idx: number): void {
    this.dirtyTrees.add(idx);
  }
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
