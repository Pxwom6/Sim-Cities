import { fnv1a } from './hash';
import { Rng } from './rng';
import { fail, ok, type Command, type CommandLogEntry, type CommandResult } from './commands';
import { RNG_STREAMS, DEFAULT_OPTIONS, type GameOptions, type RngStream, type SimState } from './state';
import { Terrain } from './terrain/terrain';
import { SAVE_VERSION, makeSaveFile, readSaveFile, stateToCanonicalJson, type SaveFile } from './save';
import type {
  BlockData,
  BudgetReport,
  CivicData,
  CivicDetails,
  VehicleData,
  BuildingData,
  CityStats,
  FrameDiff,
  NetDiff,
  NodeData,
  SegmentData,
  Snapshot,
  BuildingDetails,
  Query,
} from './protocol';
import { checkInvariants } from './invariants';
import { Network, type ZoneBlock } from './world/network';
import { UNDO_LIMIT, type UndoRecord } from './undo';
import { buildRoad, bulldoze, undoRoad } from './actions/roads';
import { undoZone, zone } from './actions/zoning';
import { v2 } from './geom';
import { GRID_RES } from '../data/world';
import {
  BState,
  accessOf,
  buildingCapacity,
  defOf,
  footprint,
  placeOnLot,
  setLotCells,
  type Building,
} from './world/buildings';
import { RoadGraph } from './systems/graph';
import { SpatialHash } from './world/spatial';
import { computeTotals, emptyTotals } from './systems/totals';
import { emptyDemand, updateDemand } from './systems/demand';
import { updateLandValue, waterDistance } from './systems/landValue';
import { growthPass, lifecycle } from './systems/growth';
import { happinessFactors, updateHappiness } from './systems/happiness';
import { runMatcher } from './systems/commute';
import { GROWTH, HAPPINESS } from '../data/balance';
import { ZONE_R } from '../data/zones';
import { TICKS_PER_HOUR, dateOf, isMonthStart } from './time';
import { bulldozeCivic, civicDef, civicRect, findAccess, placeCivic, type Civic } from './world/civic';
import { civicOutput, emptyUtilityStats, updateUtilities, utilityConsequences } from './systems/utilities';
import { dispatchGarbage, garbageHour } from './systems/garbage';
import { segSpeed, stepVehicles } from './systems/vehicles';
import { computeOverlay } from './systems/overlays';
import { coverageNear, coveragePreview, updateCoverage, type NodeCoverage } from './systems/services';
import { incidentsHour, incidentsTick } from './systems/incidents';
import { decayCrime, splatField } from './systems/pollution';
import type { ServiceKind } from '../data/civic';
import { GARBAGE, UTILITIES, VEHICLE_SPEED_SCALE } from '../data/civic';
import { fieldAt, updateGroundPollution } from './systems/pollution';
import { rectsOverlap, type ORect } from './geom';
import {
  book,
  closeMonth,
  defaultEconomy,
  economyHour,
  monthlyRates,
  repayLoan,
  setFunding,
  setTax,
  takeLoan,
} from './systems/economy';
import { fundingEffect, type Dept } from '../data/economy';

export const STARTING_FUNDS = { easy: 100_000, normal: 60_000, hard: 35_000 } as const;
const SANDBOX_FUNDS = 999_999_999;
/** The highway connection node sits this far inside the west edge. */
export const HIGHWAY_CONNECT_X = 24;

export type SimEvent = {
  kind:
    | 'fire'
    | 'crime'
    | 'death'
    | 'destroyed'
    | 'fireOut'
    | 'crimeStopped'
    | 'patientSaved'
    | 'built'
    | 'abandoned'
    | 'upgrading'
    | 'demolished'
    | 'loanRepaid'
    | 'moneyNegative'
    | 'bankrupt'
    | 'closed'
    | 'civicBuilt'
    | 'civicRemoved';
  id: number;
};

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
  /** Things that happened since the last frame (for notifications and sounds). Not saved. */
  events: SimEvent[] = [];

  private dirtyTrees = new Set<number>();
  private dirtyBuildings = new Set<number>();
  private removedBuildings = new Set<number>();
  private graphCache: RoadGraph | null = null;
  private blockOrderCache: number[] | null = null;
  private highwayComponent = -1;
  private waterDistCache: Float32Array | null = null;
  readonly bldHash = new SpatialHash(32);
  readonly civHash = new SpatialHash(64);
  private vehiclesDirty = true;
  private flagCache = new Map<number, number>();
  private dirtyCivics = new Set<number>();
  private removedCivics = new Set<number>();

  private constructor(state: SimState, terrain: Terrain) {
    this.state = state;
    this.terrain = terrain;
    this.rng = {} as Record<RngStream, Rng>;
    for (const s of RNG_STREAMS) this.rng[s] = new Rng(state.rng[s]);
    this.net = new Network(state.net, terrain, {
      nextId: () => this.state.nextId++,
      footprintBlocked: (rect) => this.civicBlocks(rect),
      buildingMoved: (id, block, col) => this.buildingMoved(id, block, col),
      buildingLost: (id) => this.removeBuilding(id),
    });
    for (const b of state.buildings.values()) this.indexBuilding(b);
    for (const c of state.civics.values()) this.indexCivic(c);
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
      buildings: new Map(),
      totals: emptyTotals(),
      demand: emptyDemand(),
      landValue: new Float32Array(GRID_RES * GRID_RES),
      cursors: { growth: 0, matchRound: 0 },
      economy: defaultEconomy(options.sandbox ? SANDBOX_FUNDS : STARTING_FUNDS[options.difficulty]),
      civics: new Map(),
      vehicles: new Map(),
      groundPollution: new Float32Array(GRID_RES * GRID_RES),
      utilityStats: emptyUtilityStats(),
      unlockAll: false,
      burning: [],
      incidents: new Map(),
      crime: new Float32Array(GRID_RES * GRID_RES),
    };
    const sim = new Sim(state, terrain);
    sim.buildHighway();
    updateLandValue(sim, true);
    updateDemand(sim);
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

  // ---------------------------------------------------------------- money (DESIGN §3.5)

  /** One-off expense booked to the ledger. */
  spend(amount: number, category: string): void {
    book(this, category, -Math.round(amount));
  }

  /** One-off income booked to the ledger. */
  earn(amount: number, category: string): void {
    book(this, category, Math.round(amount));
  }

  /** Tax rate (percent) for a zone and wealth level. */
  taxRate(zone: 'R' | 'C' | 'I', wealth: number): number {
    return this.state.economy.taxes[zone][wealth] ?? 9;
  }

  /** Monthly upkeep at 100 % funding of every department's civic buildings. */
  departmentUpkeep(): Partial<Record<Dept, number>> {
    const out: Partial<Record<Dept, number>> = {};
    for (const c of this.state.civics.values()) {
      const d = civicDef(c);
      out[d.dept] = (out[d.dept] ?? 0) + d.upkeep;
    }
    return out;
  }

  /** Travel-time multiplier on a segment from congestion and road maintenance (traffic in M6). */
  congestionFactor(_segId: number): number {
    return 0.8 + 0.2 * Math.min(1, this.fundingEff('roads'));
  }

  groundPollutionAt(x: number, z: number): number {
    return fieldAt(this.state.groundPollution, x, z);
  }

  crimeAt(x: number, z: number): number {
    return fieldAt(this.state.crime, x, z);
  }

  /** Crime committed near (x, z): raise the crime raster in a small radius. */
  addCrime(x: number, z: number, amount: number): void {
    splatField(this.state.crime, x, z, amount * 12, 3);
    for (let k = 0; k < this.state.crime.length; k++) if (this.state.crime[k]! > 1) this.state.crime[k] = 1;
  }

  /** Latest per-node service coverage (null until the first hourly update). */
  coverage: NodeCoverage | null = null;

  serviceCoverageNear(x: number, z: number, kind: ServiceKind): number {
    if (!this.coverage) this.coverage = updateCoverage(this);
    return coverageNear(this, this.coverage, x, z, kind);
  }

  /** Effectiveness (0..1.25) of a department at its current funding. */
  fundingEff(dept: Dept): number {
    return fundingEffect(this.state.economy.funding[dept] / 100);
  }

  avgTax(zone: 'R' | 'C' | 'I'): number {
    return (this.taxRate(zone, 0) + this.taxRate(zone, 1) + this.taxRate(zone, 2)) / 3;
  }

  // ---------------------------------------------------------------- derived caches

  graph(): RoadGraph {
    if (!this.graphCache) {
      this.graphCache = new RoadGraph(this.net);
      this.highwayComponent = this.graphCache.componentOfNode(this.state.highway.connect);
    }
    return this.graphCache;
  }

  isSegmentConnected(segId: number): boolean {
    const seg = this.state.net.segments.get(segId);
    if (!seg) return false;
    const g = this.graph();
    return g.componentOfNode(seg.a) === this.highwayComponent;
  }

  isBuildingConnected(b: Building): boolean {
    const block = this.state.net.blocks.get(b.block);
    return !!block && this.isSegmentConnected(block.seg);
  }

  highwayConnectedBlocks(): number {
    let n = 0;
    for (const b of this.state.net.blocks.values()) if (this.isSegmentConnected(b.seg)) n++;
    return n;
  }

  blockOrder(): number[] {
    if (!this.blockOrderCache) this.blockOrderCache = [...this.state.net.blocks.keys()].sort((a, b) => a - b);
    return this.blockOrderCache;
  }

  waterDist(): Float32Array {
    if (!this.waterDistCache) this.waterDistCache = waterDistance(this);
    return this.waterDistCache;
  }

  markNetworkChanged(): void {
    this.graphCache = null;
    this.blockOrderCache = null;
    // Civic buildings re-attach to whatever road now runs past their front.
    for (const c of this.state.civics.values()) {
      const acc = findAccess(this, c);
      const changed = (acc?.seg ?? -1) !== (c.access?.seg ?? -1);
      c.access = acc;
      if (changed) this.dirtyCivics.add(c.id);
    }
  }

  // ---------------------------------------------------------------- civic buildings

  private indexCivic(c: Civic): void {
    const r = civicRect(c);
    const rad = Math.hypot(r.hw, r.hd);
    this.civHash.insert(c.id, { minX: c.x - rad, minZ: c.z - rad, maxX: c.x + rad, maxZ: c.z + rad });
  }

  private civicBlocks(rect: ORect): boolean {
    for (const id of this.civHash.queryPoint(rect.x, rect.z, 8)) {
      const c = this.state.civics.get(id);
      if (c && rectsOverlap(rect, civicRect(c, 0.3))) return true;
    }
    return false;
  }

  addCivic(c: Civic): void {
    this.state.civics.set(c.id, c);
    this.indexCivic(c);
    this.dirtyCivics.add(c.id);
    const r = civicRect(c);
    const pad = Math.hypot(r.hw, r.hd) + 40;
    this.net.revalidate({ minX: c.x - pad, minZ: c.z - pad, maxX: c.x + pad, maxZ: c.z + pad });
    this.events.push({ kind: 'civicBuilt', id: c.id });
  }

  removeCivic(id: number): void {
    const c = this.state.civics.get(id);
    if (!c) return;
    for (const v of [...this.state.vehicles.values()]) if (v.home === id) this.state.vehicles.delete(v.id);
    this.state.civics.delete(id);
    this.civHash.remove(id);
    this.dirtyCivics.delete(id);
    this.removedCivics.add(id);
    this.vehiclesDirty = true;
    const r = civicRect(c);
    const pad = Math.hypot(r.hw, r.hd) + 40;
    this.net.revalidate({ minX: c.x - pad, minZ: c.z - pad, maxX: c.x + pad, maxZ: c.z + pad });
    this.events.push({ kind: 'civicRemoved', id });
  }

  markVehiclesDirty(): void {
    this.vehiclesDirty = true;
  }

  /** Where a zoned building meets the road. */
  buildingAccess(b: Building): { seg: number; s: number } | null {
    return accessOf(this, b);
  }

  // ---------------------------------------------------------------- buildings

  private indexBuilding(b: Building): void {
    const r = footprint(b);
    const rad = Math.hypot(r.hw, r.hd);
    this.bldHash.insert(b.id, { minX: b.x - rad, minZ: b.z - rad, maxX: b.x + rad, maxZ: b.z + rad });
  }

  markBuildingDirty(id: number): void {
    this.dirtyBuildings.add(id);
    const b = this.state.buildings.get(id);
    if (b) this.indexBuilding(b);
  }

  private buildingMoved(id: number, block: number, col: number): void {
    const b = this.state.buildings.get(id);
    if (!b) return;
    b.block = block;
    b.col = col;
    placeOnLot(this, b);
    this.markBuildingDirty(id);
  }

  removeBuilding(id: number): void {
    const b = this.state.buildings.get(id);
    if (!b) return;
    setLotCells(this, b, 0);
    this.net.clearBuildingCells(id);
    this.state.buildings.delete(id);
    this.bldHash.remove(id);
    this.dirtyBuildings.delete(id);
    this.removedBuildings.add(id);
    this.events.push({ kind: 'demolished', id });
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
    if (this.state.economy.bankrupt && cmd.type !== 'cheat') return fail('The city is bankrupt');
    switch (cmd.type) {
      case 'cheat': {
        if (cmd.cheat === 'unlockAll') {
          if (!dryRun) this.state.unlockAll = true;
          return ok(0);
        }
        if (!Number.isFinite(cmd.amount)) return fail('Invalid amount');
        if (!dryRun) this.earn(cmd.amount, 'cheats');
        return ok(0);
      }
      case 'placeBuilding':
        return placeCivic(this, cmd.def, cmd.x, cmd.z, cmd.angle, cmd.side, dryRun);
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
      case 'setTax':
        return setTax(this, cmd.zone, cmd.wealth, cmd.rate, dryRun);
      case 'setFunding':
        return setFunding(this, cmd.dept, cmd.pct, dryRun);
      case 'takeLoan':
        return takeLoan(this, cmd.amount, dryRun);
      case 'repayLoan':
        return repayLoan(this, cmd.id, dryRun);
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
    let res: CommandResult;
    if (rec.kind === 'road') res = undoRoad(this, rec, dryRun);
    else if (rec.kind === 'zone') res = undoZone(this, rec.cells, dryRun);
    else {
      if (!this.state.civics.has(rec.id)) return fail("Can't undo: that building is gone");
      res = bulldozeCivic(this, rec.id, dryRun, 1);
    }
    if (!dryRun) this.state.undo.pop();
    return res;
  }

  // ---------------------------------------------------------------- time

  step(): void {
    const s = this.state;
    s.tick++;
    const t = s.tick;
    if (s.economy.bankrupt) {
      if (this.testMode) checkInvariants(this);
      return;
    }
    if (isMonthStart(t)) {
      closeMonth(this, dateOf(t).totalMonths - 1);
      for (const c of s.civics.values()) {
        c.lastDay = c.processedToday;
        c.processedToday = 0;
      }
    }
    stepVehicles(this);
    incidentsTick(this);
    if (t % GROWTH.passInterval === 0) growthPass(this);
    if (t % TICKS_PER_HOUR === 0) {
      updateUtilities(this);
      utilityConsequences(this);
      this.coverage = updateCoverage(this);
      this.refreshFlags();
      garbageHour(this);
      dispatchGarbage(this);
      if (t % (TICKS_PER_HOUR * 3) === 0) {
        updateGroundPollution(this, 3);
        decayCrime(this, 3);
      }
      if (t % (TICKS_PER_HOUR * 2) === 0) runMatcher(this);
      updateHappiness(this);
      incidentsHour(this);
      lifecycle(this);
      s.totals = computeTotals(this);
      updateDemand(this);
      economyHour(this);
      if (t % (TICKS_PER_HOUR * 3) === 0) updateLandValue(this);
    }
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
    return makeSaveFile(this.state, this.state.totals.population, savedAt);
  }

  hash(): string {
    this.syncRng();
    return fnv1a(stateToCanonicalJson(this.state));
  }

  // ---------------------------------------------------------------- views for the main thread

  stats(): CityStats {
    const t = this.state.totals;
    const d = this.state.demand;
    return {
      tick: this.state.tick,
      treasury: this.state.treasury,
      cityName: this.state.cityName,
      population: t.population,
      undoAvailable: this.state.undo.length > 0,
      jobs: t.jobs,
      jobsFilled: t.jobsFilled,
      unemployed: t.unemployed,
      workers: t.workers,
      approval: t.approval,
      demand: { R: d.R, C: d.C, I: d.I },
      demandFactors: d.factors,
      buildings: t.buildings,
      abandoned: t.abandoned,
      highwayConnected: t.highwayConnected,
      netMonthly: this.projectedNet(),
      loans: this.state.economy.loans.length,
      bankrupt: this.state.economy.bankrupt,
      negativeHours: this.state.economy.negativeHours,
      utilities: this.state.utilityStats,
      unlockAll: this.state.unlockAll,
      civics: this.state.civics.size,
      vehicles: this.state.vehicles.size,
    };
  }

  /** Projected net income per month at current rates (whole dollars). */
  projectedNet(): number {
    const r = monthlyRates(this);
    return Math.round(Object.values(r).reduce((a, b) => a + b, 0));
  }

  budget(): BudgetReport {
    const e = this.state.economy;
    const rates = monthlyRates(this);
    return {
      treasury: this.state.treasury,
      month: { ...e.month },
      projection: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Math.round(v)])),
      history: e.history.map((h) => ({ month: h.month, lines: { ...h.lines }, treasury: h.treasury })),
      taxes: {
        R: [...e.taxes.R] as [number, number, number],
        C: [...e.taxes.C] as [number, number, number],
        I: [...e.taxes.I] as [number, number, number],
      },
      funding: { ...e.funding },
      loans: e.loans.map((l) => ({
        id: l.id,
        principal: l.principal,
        annualRate: l.annualRate,
        months: l.months,
        payment: Math.round(l.payment),
        balance: Math.ceil(l.balance),
      })),
      negativeHours: e.negativeHours,
      bankrupt: e.bankrupt,
      monthStartTreasury: e.monthStartTreasury,
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
    const d = this.net.dirty;
    const r = this.net.removed;
    for (const set of [
      d.nodes,
      d.segments,
      d.blocks,
      r.nodes,
      r.segments,
      r.blocks,
      this.dirtyBuildings,
      this.removedBuildings,
      this.dirtyCivics,
      this.removedCivics,
    ])
      set.clear();
    this.vehiclesDirty = false;
    this.events = [];
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
      buildings: [...this.state.buildings.values()].map((b) => this.buildingData(b)),
      civics: [...this.state.civics.values()].map((c) => this.civicData(c)),
      vehicles: this.vehicleData(),
    };
  }

  /** Problem flags shown as icons: see BuildingData.flags. */
  buildingFlags(b: Building): number {
    let f = this.isBuildingConnected(b) ? 0 : 1;
    if (b.state === BState.Active) {
      if (b.power < 0.99) f |= 2;
      if (b.water < 0.99) f |= 4;
      if (b.sewage < 0.99) f |= 8;
      if (b.garbage >= GARBAGE.visible) f |= 16;
      if (b.closed) f |= 32;
      if (b.polluted > 0.2) f |= 64;
    }
    if (b.fire > 0) f |= 128;
    return f;
  }

  /** Mark buildings whose problem flags changed so the renderer updates their icons. */
  private refreshFlags(): void {
    for (const b of this.state.buildings.values()) {
      const f = this.buildingFlags(b);
      if (this.flagCache.get(b.id) !== f) {
        this.flagCache.set(b.id, f);
        this.dirtyBuildings.add(b.id);
      }
    }
  }

  civicData(c: Civic): CivicData {
    const d = civicDef(c);
    return {
      id: c.id,
      def: c.def,
      x: c.x,
      z: c.z,
      y: c.y,
      angle: c.angle,
      side: c.side,
      access: !!c.access,
      fill: d.garbage?.storage ? c.stored / d.garbage.storage : 0,
      out: c.out,
      variant: c.variant,
    };
  }

  private vehicleData(): VehicleData[] {
    return [...this.state.vehicles.values()].map((v) => ({
      id: v.id,
      kind: v.kind,
      phase: v.phase,
      leg: v.leg,
      t: v.t,
      legs: v.legs.map((l) => ({ ...l, v: VEHICLE_SPEED_SCALE * segSpeed(this, l.seg) })),
    }));
  }

  buildingData(b: Building): BuildingData {
    return {
      id: b.id,
      def: b.def,
      zone: b.zone,
      density: b.density,
      wealth: b.wealth,
      level: b.level,
      x: b.x,
      z: b.z,
      y: b.y,
      angle: b.angle,
      side: b.side,
      w: b.w,
      d: b.d,
      state: b.state,
      progress: b.progress,
      variant: b.variant,
      flags: this.buildingFlags(b),
      fire: Math.round(b.fire * 10) / 10,
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
    }
    if (this.dirtyBuildings.size || this.removedBuildings.size) {
      frame.buildings = {
        upserts: [...this.dirtyBuildings]
          .filter((id) => this.state.buildings.has(id))
          .sort((a, b) => a - b)
          .map((id) => this.buildingData(this.state.buildings.get(id)!)),
        removed: [...this.removedBuildings].sort((a, b) => a - b),
      };
      this.dirtyBuildings.clear();
      this.removedBuildings.clear();
    }
    if (this.dirtyCivics.size || this.removedCivics.size) {
      frame.civics = {
        upserts: [...this.dirtyCivics]
          .filter((id) => this.state.civics.has(id))
          .sort((a, b) => a - b)
          .map((id) => this.civicData(this.state.civics.get(id)!)),
        removed: [...this.removedCivics].sort((a, b) => a - b),
      };
      this.dirtyCivics.clear();
      this.removedCivics.clear();
    }
    if (this.vehiclesDirty) {
      frame.vehicles = this.vehicleData();
      this.vehiclesDirty = false;
    }
    if (this.events.length) {
      frame.events = this.events;
      this.events = [];
    }
    return frame;
  }

  markTreesDirty(idx: number): void {
    this.dirtyTrees.add(idx);
  }

  // ---------------------------------------------------------------- queries

  query(q: Query): unknown {
    switch (q.type) {
      case 'hash':
        return this.hash();
      case 'summary':
        return this.stats();
      case 'building':
        return this.buildingDetails(q.id);
      case 'budget':
        return this.budget();
      case 'civic':
        return this.civicDetails(q.id);
      case 'overlay':
        return computeOverlay(this, q.map);
      case 'coveragePreview':
        return coveragePreview(this, q.def, q.x, q.z, q.angle, q.side);
    }
  }

  civicDetails(id: number): CivicDetails | null {
    const c = this.state.civics.get(id);
    if (!c) return null;
    const d = civicDef(c);
    const produces: { utility: string; output: number }[] = [];
    for (const u of ['power', 'water', 'sewage'] as const) {
      const out = civicOutput(this, c, u);
      if (out > 0) produces.push({ utility: u, output: Math.round(out) });
    }
    return {
      id: c.id,
      def: c.def,
      name: d.name,
      category: d.category,
      blurb: d.blurb,
      upkeep: Math.round(d.upkeep * (this.state.economy.funding[d.dept] / 100)),
      funding: this.state.economy.funding[d.dept],
      access: !!c.access,
      produces,
      polluted:
        produces.some((p) => p.utility === 'water') &&
        this.groundPollutionAt(c.x, c.z) > UTILITIES.pollutedPumpThreshold,
      garbage: d.garbage
        ? {
            trucks: Math.round(d.garbage.trucks * this.fundingEff('garbage')),
            out: c.out,
            stored: Math.round(c.stored),
            storage: d.garbage.storage ?? 0,
            processedToday: Math.round(c.processedToday),
            process: d.garbage.process ?? 0,
          }
        : null,
      refund: Math.round(c.cost * 0.25),
    };
  }

  buildingDetails(id: number): BuildingDetails | null {
    const b = this.state.buildings.get(id);
    if (!b) return null;
    const def = defOf(b);
    const factors = b.state === BState.Active || b.pop > 0 ? happinessFactors(this, b) : [];
    return {
      id: b.id,
      name: def.name,
      zone: b.zone,
      density: b.density,
      wealth: b.wealth,
      level: b.level,
      state: b.state,
      progress: b.progress,
      pop: b.pop,
      cap: b.cap || buildingCapacity(b),
      employed: b.employed,
      commute: b.commute,
      shop: b.shop,
      happiness: b.happiness,
      base: HAPPINESS.base,
      factors,
      distress: b.distress,
      abandonAt: GROWTH.abandonAt,
      isResidential: b.zone === ZONE_R,
      connected: this.isBuildingConnected(b),
      born: b.born,
      power: b.power,
      water: b.water,
      sewage: b.sewage,
      polluted: b.polluted,
      garbage: Math.round(b.garbage),
      closed: b.closed,
      coverage: {
        fire: b.covFire,
        police: b.covPolice,
        health: b.covHealth,
        education: b.covEdu,
        park: b.covPark,
      },
      crime: Math.round(this.crimeAt(b.x, b.z) * 100) / 100,
      fire: b.fire,
    };
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
