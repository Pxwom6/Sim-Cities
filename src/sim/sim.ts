import { fnv1a } from './hash';
import { Rng } from './rng';
import { fail, ok, type Command, type CommandLogEntry, type CommandResult } from './commands';
import { RNG_STREAMS, DEFAULT_OPTIONS, type GameOptions, type RngStream, type SimState } from './state';
import { Terrain } from './terrain/terrain';
import { SAVE_VERSION, makeSaveFile, readSaveFile, stateToCanonicalJson, type SaveFile } from './save';
import type { BlockData, CityStats, FrameDiff, NetDiff, NodeData, SegmentData, Snapshot } from './protocol';
import { checkInvariants } from './invariants';
import { Network, type ZoneBlock } from './world/network';
import { UNDO_LIMIT, type UndoRecord } from './undo';
import { buildRoad, bulldoze, undoRoad } from './actions/roads';
import { undoZone, zone } from './actions/zoning';
import { v2 } from './geom';

export const STARTING_FUNDS = { easy: 100_000, normal: 60_000, hard: 35_000 } as const;
const SANDBOX_FUNDS = 999_999_999;
/** The highway connection node sits this far inside the west edge. */
export const HIGHWAY_CONNECT_X = 24;

/**
 * The simulation. Pure TypeScript, deterministic, runs in the worker and headlessly in tests.
 * All mutation goes through `dispatch` (commands) and `step` (one fixed tick).
 */
export class Sim {
  state: SimState;
  readonly terrain: Terrain;
  readonly rng: Record<RngStream, Rng>;
  readonly net: Network;
  /** Every applied command with the tick it was applied at (for replays). Not part of the hash. */
  readonly log: CommandLogEntry[] = [];
  /** When true, invariants are checked after every tick and violations throw. */
  testMode = false;

  private dirtyTrees = new Set<number>();
  private sendFullNet = false;

  private constructor(state: SimState, terrain: Terrain) {
    this.state = state;
    this.terrain = terrain;
    this.rng = {} as Record<RngStream, Rng>;
    for (const s of RNG_STREAMS) this.rng[s] = new Rng(state.rng[s]);
    this.net = new Network(state.net, terrain, {
      nextId: () => this.state.nextId++,
      footprintBlocked: () => false,
      buildingMoved: () => {},
      buildingLost: () => {},
    });
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
      nextId: 1,
      rng,
      treasury: options.sandbox ? SANDBOX_FUNDS : STARTING_FUNDS[options.difficulty],
      cityName: options.cityName,
      trees: terrain.initialTrees.slice(),
      net: { nodes: new Map(), segments: new Map(), blocks: new Map() },
      highway: { outside: 0, connect: 0, segment: 0 },
      undo: [],
    };
    const sim = new Sim(state, terrain);
    sim.buildHighway();
    return sim;
  }

  static fromSave(save: SaveFile): Sim {
    const state = readSaveFile(save);
    const terrain = new Terrain(state.options.seed, state.options.preset);
    return new Sim(state, terrain);
  }

  private buildHighway(): void {
    const hw = this.terrain.gen.params.highway;
    const outside = this.net.createNode(hw.lineX, hw.connectZ);
    const connect = this.net.createNode(HIGHWAY_CONNECT_X, hw.connectZ);
    const seg = this.net.createSegment(
      outside.id,
      connect.id,
      v2((hw.lineX + HIGHWAY_CONNECT_X) / 2, hw.connectZ),
      'highway',
      { zoned: false },
    );
    this.state.highway = { outside: outside.id, connect: connect.id, segment: seg.id };
  }

  get tick(): number {
    return this.state.tick;
  }

  // ---------------------------------------------------------------- money (full ledger in M3)

  spend(amount: number, _category: string): void {
    this.state.treasury -= Math.round(amount);
  }

  earn(amount: number, _category: string): void {
    this.state.treasury += Math.round(amount);
  }

  // ---------------------------------------------------------------- commands

  dispatch(cmd: Command): CommandResult {
    const result = this.apply(cmd, false);
    if (result.ok) this.log.push({ tick: this.state.tick, cmd: JSON.parse(JSON.stringify(cmd)) as Command });
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
        if (!dryRun) this.earn(cmd.amount, 'cheats');
        return ok(0);
      }
      case 'renameCity': {
        const name = cmd.name.trim().slice(0, 40);
        if (!name) return fail('Name cannot be empty');
        if (!dryRun) this.state.cityName = name;
        return ok(0);
      }
      case 'buildRoad':
        return buildRoad(this, cmd.road, cmd.points, dryRun);
      case 'bulldoze':
        return bulldoze(this, cmd.target, dryRun);
      case 'zone':
        return zone(this, cmd.zone, cmd.area, dryRun, cmd.stroke);
      case 'undo':
        return this.undo(dryRun);
      default: {
        const never: never = cmd;
        return fail(`Unknown command ${(never as { type: string }).type}`);
      }
    }
  }

  pushUndo(rec: UndoRecord): void {
    this.state.undo.push(rec);
    if (this.state.undo.length > UNDO_LIMIT) this.state.undo.shift();
  }

  private undo(dryRun: boolean): CommandResult {
    const rec = this.state.undo[this.state.undo.length - 1];
    if (!rec) return fail('Nothing to undo');
    const res = rec.kind === 'road' ? undoRoad(this, rec, dryRun) : undoZone(this, rec.cells, dryRun);
    if (!dryRun) this.state.undo.pop();
    return res;
  }

  markNetworkChanged(): void {
    // Hook for systems that cache network-derived data (utilities, coverage, traffic).
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
      undoAvailable: this.state.undo.length > 0,
    };
  }

  private netData(): { nodes: NodeData[]; segments: SegmentData[]; blocks: BlockData[] } {
    const n = this.state.net;
    return {
      nodes: [...n.nodes.values()].map((x) => ({ ...x })),
      segments: [...n.segments.values()].map((x) => ({ ...x })),
      blocks: [...n.blocks.values()].map(blockData),
    };
  }

  snapshot(): Snapshot {
    this.net.dirty.nodes.clear();
    this.net.dirty.segments.clear();
    this.net.dirty.blocks.clear();
    this.net.removed.nodes.clear();
    this.net.removed.segments.clear();
    this.net.removed.blocks.clear();
    return {
      options: { ...this.state.options },
      terrainParams: this.terrain.gen.params,
      heights: this.terrain.heights.slice(),
      trees: this.state.trees.slice(),
      groundwater: this.terrain.groundwater.slice(),
      ore: this.terrain.ore.slice(),
      oil: this.terrain.oil.slice(),
      stats: this.stats(),
      net: this.netData(),
      highway: { ...this.state.highway },
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
    const d = this.net.dirty;
    const r = this.net.removed;
    if (
      this.sendFullNet ||
      d.nodes.size ||
      d.segments.size ||
      d.blocks.size ||
      r.nodes.size ||
      r.segments.size ||
      r.blocks.size
    ) {
      const n = this.state.net;
      const diff: NetDiff = {
        nodes: [...d.nodes]
          .filter((id) => n.nodes.has(id))
          .sort((a, b) => a - b)
          .map((id) => ({ ...n.nodes.get(id)! })),
        segments: [...d.segments]
          .filter((id) => n.segments.has(id))
          .sort((a, b) => a - b)
          .map((id) => ({ ...n.segments.get(id)! })),
        blocks: [...d.blocks]
          .filter((id) => n.blocks.has(id))
          .sort((a, b) => a - b)
          .map((id) => blockData(n.blocks.get(id)!)),
        removedNodes: [...r.nodes].sort((a, b) => a - b),
        removedSegments: [...r.segments].sort((a, b) => a - b),
        removedBlocks: [...r.blocks].sort((a, b) => a - b),
      };
      frame.net = diff;
      for (const s of [d.nodes, d.segments, d.blocks, r.nodes, r.segments, r.blocks]) s.clear();
      this.sendFullNet = false;
    }
    return frame;
  }

  markTreesDirty(idx: number): void {
    this.dirtyTrees.add(idx);
  }
}

function blockData(b: ZoneBlock): BlockData {
  return {
    id: b.id,
    seg: b.seg,
    side: b.side,
    s0: b.s0,
    cols: b.cols,
    zone: b.zone.slice(),
    valid: b.valid.slice(),
    bld: b.bld.slice(),
  };
}
