// Balance tool: plays scripted strategies headlessly for years of game time and prints curves of
// population, treasury, approval and demand (SPEC §8).
// Usage: npx tsx scripts/balance.ts [years=20] [careful,greedy,neglectful] [--csv dir] [--seed s]
import { mkdirSync, writeFileSync } from 'node:fs';
import { Sim } from '../src/sim/sim';
import { checkInvariants } from '../src/sim/invariants';
import { CIVIC } from '../src/data/civic';
import { ROAD_TYPES, type RoadTypeId } from '../src/data/roads';
import { advise } from '../src/sim/systems/advisors';
import type { CityStats } from '../src/sim/protocol';
import { TAX_BASE, type Dept } from '../src/data/economy';
import { CELL, ROWS, ZONE_NONE } from '../src/data/zones';
import { GRID_CELL, GRID_RES } from '../src/data/world';
import { TICKS_PER_HOUR, TICKS_PER_MONTH } from '../src/sim/time';
import { roadsidePose } from '../src/sim/world/civic';
import { happinessFactors } from '../src/sim/systems/happiness';
import { BState } from '../src/sim/world/buildings';
import { GROWTH } from '../src/data/balance';

type Vec2 = { x: number; z: number };
type StrategyId = 'careful' | 'greedy' | 'neglectful';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const csvDir = flag('--csv');
const verbose = Number(flag('--verbose') ?? 0);
// --invariants: check the sim's invariants every game hour (a long headless soak).
const invariants = args.includes('--invariants');
if (invariants) args.splice(args.indexOf('--invariants'), 1);
const seed = flag('--seed') ?? 'balance';
const difficulty = (flag('--difficulty') ?? 'normal') as 'easy' | 'normal' | 'hard';
// Exploration knobs (in memory only): --scale tax=1.5,upkeep=0.8,road=1
const scale = Object.fromEntries(
  (flag('--scale') ?? '')
    .split(',')
    .filter(Boolean)
    .map((kv) => kv.split('='))
    .map(([k, v]) => [k, Number(v)]),
) as Record<string, number>;
if (scale.tax)
  for (const z of ['R', 'C', 'I'] as const) TAX_BASE[z] = TAX_BASE[z].map((v) => v * scale.tax!) as never;
if (scale.upkeep) for (const d of CIVIC.values()) d.upkeep = Math.round(d.upkeep * scale.upkeep);
if (scale.road) for (const r of Object.values(ROAD_TYPES)) r.upkeepPerMetre *= scale.road;
const years = Number(args[0] ?? 20);
const strategies = (args[1] ?? 'careful,greedy,neglectful').split(',') as StrategyId[];
const MONTHS_PER_YEAR = 12;

/** District grid: each district is a 480 m avenue piece with four crossing side streets. */
const DW = 480;
const ROW = 380;
const HALF = 160;
const DISTRICT_ORDER: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 1],
  [0, -2],
  [1, -2],
  [0, 2],
  [1, 2],
  [2, 0],
  [2, -1],
  [2, 1],
  [2, -2],
  [2, 2],
];

interface Sample {
  month: number;
  population: number;
  treasury: number;
  approval: number;
  R: number;
  C: number;
  I: number;
  net: number;
  abandoned: number;
  districts: number;
  civics: number;
}

class Player {
  readonly sim: Sim;
  readonly c: Vec2;
  districts: { i: number; j: number; segs: number[] }[] = [];
  log: string[] = [];

  constructor(readonly strategy: StrategyId) {
    this.sim = Sim.create({ seed, preset: 'river', cityName: strategy, difficulty });
    const hw = this.sim.state.net.nodes.get(this.sim.state.highway.connect)!;
    this.c = { x: hw.x, z: hw.z };
  }

  stats(): CityStats {
    return this.sim.query({ type: 'summary' }) as CityStats;
  }

  road(type: RoadTypeId, a: Vec2, b: Vec2): number[] {
    const r = this.sim.dispatch({ type: 'buildRoad', road: type, points: [a, b] });
    return r.ok ? (r.created ?? []) : [];
  }

  districtCost(): number {
    return DW * ROAD_TYPES.avenue.costPerMetre + 4 * 2 * HALF * ROAD_TYPES.street.costPerMetre;
  }

  /** Lay out and zone the next district, if there's money for it. */
  buildDistrict(): boolean {
    const next = DISTRICT_ORDER[this.districts.length];
    if (!next || this.sim.state.treasury < this.districtCost() + 2_000) return false;
    const [i, j] = next;
    const x0 = this.c.x + i * DW;
    const z = this.c.z + j * ROW;
    const segs: number[] = [];
    segs.push(...this.road('avenue', { x: x0, z }, { x: x0 + DW, z }));
    for (let k = 1; k <= 4; k++) {
      const x = x0 + (DW * k) / 5;
      segs.push(...this.road('street', { x, z: z - HALF }, { x, z: z + HALF }));
      // Join the side streets to the neighbouring rows so every district reaches the highway.
      for (const d of this.districts)
        if (d.i === i && Math.abs(d.j - j) === 1) {
          const zn = this.c.z + d.j * ROW;
          const a = d.j < j ? zn + HALF : z + HALF;
          const b = d.j < j ? z - HALF : zn - HALF;
          segs.push(...this.road('street', { x, z: a }, { x, z: b }));
        }
    }
    // Avenue rows off the highway row are also joined end to end at the district's west edge.
    if (j !== 0 && i === 0) {
      const zNear = this.c.z + (j > 0 ? j - 1 : j + 1) * ROW;
      segs.push(...this.road('avenue', { x: x0 + 12, z: zNear }, { x: x0 + 12, z }));
    }
    const zone = (letter: 'R' | 'C' | 'I', a: Vec2, b: Vec2, radius: number) =>
      this.sim.dispatch({ type: 'zone', zone: letter, area: { kind: 'brush', points: [a, b], radius } });
    zone('R', { x: x0 + 20, z: z - 100 }, { x: x0 + DW, z: z - 100 }, 70);
    zone('C', { x: x0 + 20, z: z + 20 }, { x: x0 + DW, z: z + 20 }, 22);
    zone('R', { x: x0 + 20, z: z + 90 }, { x: x0 + DW / 2, z: z + 90 }, 50);
    zone('I', { x: x0 + DW / 2 + 20, z: z + 110 }, { x: x0 + DW, z: z + 110 }, 50);
    this.districts.push({ i, j, segs });
    this.log.push(`m${this.month()}: district ${i},${j}`);
    return true;
  }

  month(): number {
    return Math.floor(this.sim.state.tick / TICKS_PER_MONTH);
  }

  /** Share of zoned cells still without a building (of one zone, or all). */
  vacancy(zone?: number): number {
    let zoned = 0;
    let empty = 0;
    for (const b of this.sim.state.net.blocks.values())
      // Growth looks at each lot's front cell (deep buildings fill the rows behind it).
      for (let k = 0; k < b.zone.length; k += ROWS) {
        if (b.zone[k] === ZONE_NONE || !b.valid[k] || (zone !== undefined && b.zone[k] !== zone)) continue;
        zoned++;
        if (b.bld[k] === 0) empty++;
      }
    return zoned ? empty / zoned : 1;
  }

  /** Some zone is in demand and has little room left. */
  wantsRoom(threshold = 0.15, full = 0.25): boolean {
    const d = this.stats().demand;
    return ([d.R, d.C, d.I] as number[]).some((v, k) => v > threshold && this.vacancy(k + 1) < full);
  }

  /** Place a civic building, trying industrial side streets first (utilities) or anywhere. */
  place(def: string, near: 'industry' | 'homes' | 'clean' = 'homes'): boolean {
    const d = CIVIC.get(def);
    if (!d || !this.sim.isUnlocked(d.unlockPopulation)) return false;
    if (this.sim.state.treasury < d.cost + 1_000) return false;
    const segs = [...this.sim.state.net.segments.values()].filter((s) => s.type !== 'highway');
    const mid = (id: number) => {
      const cv = this.sim.net.curve(id);
      return cv.pointAt(cv.length / 2);
    };
    // Utilities go to the industrial (south-east) end of the newest districts; the rest spread out.
    // Pumps go where the ground water is best and cleanest, on the residential (north) side.
    const score = (id: number) => {
      const p = mid(id);
      if (near === 'industry') return -(p.x - this.c.x) - 2 * (p.z - this.c.z);
      if (near === 'clean') {
        const i = Math.min(GRID_RES - 1, Math.max(0, Math.floor(p.x / GRID_CELL)));
        const j = Math.min(GRID_RES - 1, Math.max(0, Math.floor(p.z / GRID_CELL)));
        const gw = this.sim.terrain.groundwater[j * GRID_RES + i]! / 255;
        return 20 * this.sim.groundPollutionAt(p.x, p.z) - gw + (p.z > this.c.z - 40 ? 0.5 : 0);
      }
      return (id * 2654435761) % 997;
    };
    segs.sort((a, b) => score(a.id) - score(b.id));
    for (const s of segs) {
      const len = this.sim.net.curve(s.id).length;
      for (let at = d.w / 2 + 12; at < len - d.w / 2 - 12; at += 10)
        for (const side of [1, -1] as const) {
          const pose = roadsidePose(this.sim.net, s.id, at, side, d.d);
          if (this.sim.dispatch({ type: 'placeBuilding', def, ...pose }).ok) {
            this.log.push(`m${this.month()}: ${def}`);
            return true;
          }
        }
    }
    return near === 'homes' && this.makeRoom(def);
  }

  /**
   * No free roadside lot: clear one, as a player would, starting with abandoned buildings and
   * rubble, then the smallest homes. Tries a few spots and gives up if none will take the building.
   */
  makeRoom(def: string): boolean {
    const d = CIVIC.get(def)!;
    const candidates = [...this.sim.state.buildings.values()]
      .filter((b) => b.state === BState.Abandoned || b.state === BState.Rubble || b.density === 0)
      .sort(
        (a, b) =>
          Number(b.state === BState.Abandoned) - Number(a.state === BState.Abandoned) || a.cap - b.cap,
      )
      .slice(0, 12);
    for (const b of candidates) {
      const block = this.sim.state.net.blocks.get(b.block);
      if (!block) continue;
      const len = this.sim.net.curve(block.seg).length;
      const at = Math.min(Math.max(block.s0 + (b.col + b.w / 2) * CELL, d.w / 2 + 8), len - d.w / 2 - 8);
      const pose = roadsidePose(this.sim.net, block.seg, at, block.side, d.d);
      const r = Math.hypot(d.w, d.d) / 2 + 6;
      const clear = [...this.sim.state.buildings.values()].filter(
        (o) => Math.hypot(o.x - pose.x, o.z - pose.z) < r + (Math.hypot(o.w, o.d) * CELL) / 2,
      );
      if (clear.length > 12 || this.sim.state.treasury < d.cost + 2_000) continue;
      for (const o of clear) this.sim.dispatch({ type: 'bulldoze', target: { kind: 'building', id: o.id } });
      if (this.sim.dispatch({ type: 'placeBuilding', def, ...pose }).ok) {
        this.log.push(`m${this.month()}: ${def} (cleared ${clear.length})`);
        return true;
      }
    }
    return false;
  }

  count(def: string): number {
    let n = 0;
    for (const c of this.sim.state.civics.values()) if (c.def === def) n++;
    return n;
  }

  setTaxes(rate: number): void {
    for (const zone of ['R', 'C', 'I'] as const)
      this.sim.dispatch({ type: 'setTax', zone, wealth: 'all', rate });
  }

  setFunding(pct: number): void {
    for (const dept of Object.keys(this.sim.state.economy.funding) as Dept[])
      this.sim.dispatch({ type: 'setFunding', dept, pct });
  }

  /** Keep power, water and sewage ahead of demand. */
  utilities(cheap: boolean): void {
    const u = this.stats().utilities;
    if (u.power.supply < u.power.demand * 1.15 + 10)
      this.place(!cheap && u.power.demand > 60 ? 'coal' : 'wind', 'industry');
    if (u.water.supply < u.water.demand * 1.15 + 10) this.place('pump', cheap ? 'industry' : 'clean');
    if (u.sewage.supply < u.sewage.demand * 1.15 + 10) {
      const big = u.sewage.demand > 300 && !cheap && this.sim.isUnlocked(2_000);
      if (!(big && this.place('treatment', 'industry'))) this.place('septic', 'industry');
    }
  }

  private lastBuilt = new Map<string, number>();

  /** Act on what the advisors say is urgent, as a sensible player would (giving each fix time). */
  followAdvice(): void {
    const pop = this.sim.state.totals.population;
    const now = this.sim.state.tick;
    // One of each service per so many residents (plus one), and time for each to take effect.
    const PER: Record<string, number> = {
      landfill: 5_000,
      recycling: 3_000,
      firestation: 2_500,
      police: 2_500,
      clinic: 2_500,
      hospital: 10_000,
      primary: 2_500,
      highschool: 6_000,
    };
    const act = (kind: string, def: string, near: 'industry' | 'homes' = 'homes') => {
      if (now - (this.lastBuilt.get(kind) ?? -1e9) < TICKS_PER_MONTH * 2) return;
      if (this.count(def) >= Math.ceil(pop / (PER[def] ?? 1e9)) + 1) return;
      if (this.place(def, near)) this.lastBuilt.set(kind, now);
    };
    for (const a of advise(this.sim)) {
      if (a.severity < 2) continue;
      const t = a.title.toLowerCase();
      if (a.advisor === 'utilities' && /garbage/.test(t)) {
        // Spread out: trucks only reach so far.
        act('garbage', 'landfill');
        act('garbage2', 'recycling');
      } else if (a.advisor === 'safety' && /fire cover/.test(t)) act('fire', 'firestation');
      else if (a.advisor === 'safety' && /crime|police/.test(t)) act('police', 'police');
      else if (a.advisor === 'health') {
        if (pop > 6_000) act('health2', 'hospital');
        act('health', 'clinic');
      } else if (a.advisor === 'education') {
        act('school', 'primary');
        if (pop > 3_000) act('school2', 'highschool');
      }
    }
  }

  /** One decision round (every six game hours). */
  play(): void {
    const s = this.stats();
    const e = this.sim.state.economy;
    const growRoom = this.wantsRoom();
    if (this.strategy === 'careful') {
      this.utilities(false);
      // Services once there's a town to serve.
      if (s.population >= 250) this.followAdvice();
      // Expand when the city wants room, borrowing for it while the budget is in the black.
      if (this.districts.length === 0 || (growRoom && this.vacancy() < 0.3)) {
        if (
          this.sim.state.treasury < this.districtCost() + 2_000 &&
          s.netMonthly > 300 &&
          e.loans.length === 0
        )
          this.sim.dispatch({ type: 'takeLoan', amount: 25_000 });
        this.buildDistrict();
      }
      if (this.count('park_small') < this.districts.length) this.place('park_small');
      // Taxes: nudge up while losing money, back down when comfortable.
      const rate = e.taxes.R[0]!;
      if (s.netMonthly < 0 && s.treasury < -s.netMonthly * 6 && rate < 12) this.setTaxes(rate + 1);
      else if (s.netMonthly > 0 && s.treasury > 60_000 && rate > 9) this.setTaxes(rate - 1);
      // Comfortably off: trade money for happier residents and more demand.
      else if (s.netMonthly > 0 && s.treasury > 250_000 && rate > 6) this.setTaxes(rate - 1);
      if (s.treasury < 3_000 && e.loans.length === 0) this.sim.dispatch({ type: 'takeLoan', amount: 25_000 });
    } else if (this.strategy === 'greedy') {
      // Squeeze taxes, underfund services, zone as fast as money allows, build only utilities.
      this.setTaxes(15);
      this.setFunding(70);
      this.utilities(true);
      if (this.districts.length === 0 || this.vacancy() < 0.35) this.buildDistrict();
    } else {
      // Neglectful: a first district and one of each utility, then nothing.
      if (this.districts.length === 0) {
        this.buildDistrict();
        this.place('coal', 'industry');
        this.place('pump', 'clean');
        this.place('septic', 'industry');
      }
    }
  }

  sample(): Sample {
    const s = this.stats();
    return {
      month: this.month(),
      population: s.population,
      treasury: s.treasury,
      approval: s.approval,
      R: s.demand.R,
      C: s.demand.C,
      I: s.demand.I,
      net: s.netMonthly,
      abandoned: s.abandoned,
      districts: this.districts.length,
      civics: this.sim.state.civics.size,
    };
  }
}

/** Why moods are what they are: mean factor per zone, and how many are in distress. */
function moods(p: Player): void {
  for (const [zone, label] of [
    [1, 'R'],
    [2, 'C'],
    [3, 'I'],
  ] as const) {
    const list = [...p.sim.state.buildings.values()].filter(
      (b) => b.zone === zone && b.state === BState.Active,
    );
    if (!list.length) continue;
    const sum = new Map<string, number>();
    for (const b of list)
      for (const f of happinessFactors(p.sim, b))
        sum.set(f.label, (sum.get(f.label) ?? 0) + f.value / list.length);
    const low = list.filter((b) => b.happiness < GROWTH.distressHappiness).length;
    const mean = list.reduce((a, b) => a + b.happiness, 0) / list.length;
    const top = [...sum.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(', ');
    console.log(`      ${label}: ${list.length} active, mood ${mean.toFixed(2)}, ${low} distressed | ${top}`);
  }
}

const BARS = '▁▂▃▄▅▆▇█';
function spark(values: number[], lo = Math.min(...values), hi = Math.max(...values)): string {
  return values
    .map((v) => BARS[Math.max(0, Math.min(7, Math.round(((v - lo) / (hi - lo || 1)) * 7)))])
    .join('');
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

for (const id of strategies) {
  const t0 = performance.now();
  const p = new Player(id);
  const samples: Sample[] = [];
  const months = years * MONTHS_PER_YEAR;
  for (let m = 0; m < months; m++) {
    for (let h = 0; h < 4; h++) {
      p.play();
      if (!invariants) p.sim.advance(TICKS_PER_HOUR * 6);
      else
        for (let k = 0; k < 6; k++) {
          p.sim.advance(TICKS_PER_HOUR);
          checkInvariants(p.sim);
        }
    }
    samples.push(p.sample());
    if (m < verbose) {
      const st = p.stats();
      const u = st.utilities;
      const e = p.sim.state.economy;
      const last = e.history[e.history.length - 1]?.lines ?? {};
      const lines = Object.entries(last)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 6)
        .map(([k, v]) => `${k} ${fmt(v)}`)
        .join(', ');
      console.log(
        `  m${m + 1}: pop ${st.population} bld ${st.buildings} abandoned ${st.abandoned} jobs ${st.jobsFilled}/${st.jobs} ` +
          `approval ${Math.round(st.approval * 100)}% $${fmt(st.treasury)} net ${fmt(st.netMonthly)} | ` +
          `power ${u.power.supply}/${Math.round(u.power.demand)} water ${u.water.supply}/${Math.round(u.water.demand)} ` +
          `sewage ${u.sewage.supply}/${Math.round(u.sewage.demand)} | ${lines}`,
      );
      moods(p);
    }
  }
  if (process.env.MOOD) moods(p);
  if (process.env.GARB) {
    for (const c of p.sim.state.civics.values()) {
      const g = p.sim.civicDetails(c.id)?.garbage;
      if (g)
        console.log(
          `  ${c.def} #${c.id} at ${Math.round(c.x)},${Math.round(c.z)}: trucks ${g.out}/${g.trucks} stored ${Math.round(g.stored)}/${g.storage} processed ${Math.round(g.processedToday)}/${g.process}`,
        );
    }
    const dirty = [...p.sim.state.buildings.values()].filter((b) => b.garbage > 20);
    console.log(
      `  dirty buildings ${dirty.length} of ${p.sim.state.buildings.size}; mean garbage ${(dirty.reduce((a, b) => a + b.garbage, 0) / Math.max(1, dirty.length)).toFixed(0)}`,
    );
  }
  if (process.env.TRYPLACE) {
    const def = process.env.TRYPLACE;
    const seg = [...p.sim.state.net.segments.values()].find((x) => x.type === 'street')!;
    const d = CIVIC.get(def)!;
    const pose = roadsidePose(p.sim.net, seg.id, 40, 1, d.d);
    console.log(
      'try',
      def,
      JSON.stringify(p.sim.dispatch({ type: 'placeBuilding', def, ...pose })),
      'place()',
      p.place(def),
    );
    for (const a of advise(p.sim)) if (a.severity >= 2) console.log('  advice', a.severity, a.title);
  }
  if (process.env.ADVICE)
    for (const a of advise(p.sim))
      if (a.severity >= 1) console.log(`advice ${a.severity} ${a.advisor}: ${a.title} — ${a.text}`);
  if (process.env.DEMAND) {
    const st = p.stats();
    console.log('vacancy R/C/I', [1, 2, 3].map((z) => p.vacancy(z).toFixed(2)).join(' '));
    for (const z of ['R', 'C', 'I'] as const)
      console.log(
        z,
        st.demand[z].toFixed(2),
        st.demandFactors[z].map((f) => `${f.label} ${f.value.toFixed(2)}`).join(', '),
      );
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(0);
  console.log(`\n=== ${id} (${years} years, ${secs} s) ===`);
  console.log(
    'year  population   treasury   approval   demand R/C/I      net/mo  abandoned districts civics',
  );
  for (let y = 1; y <= years; y++) {
    const s = samples[y * MONTHS_PER_YEAR - 1]!;
    console.log(
      `${String(y).padStart(4)} ${fmt(s.population).padStart(11)} ${fmt(s.treasury).padStart(10)} ${`${Math.round(s.approval * 100)}%`.padStart(10)}   ${[s.R, s.C, s.I].map((d) => d.toFixed(2).padStart(5)).join(' ')} ${fmt(s.net).padStart(10)} ${String(s.abandoned).padStart(10)} ${String(s.districts).padStart(9)} ${String(s.civics).padStart(6)}`,
    );
  }
  const col = (k: keyof Sample) => samples.map((s) => s[k] as number);
  console.log(`population ${spark(col('population'))}`);
  console.log(`treasury   ${spark(col('treasury'))}`);
  console.log(`approval   ${spark(col('approval'), 0, 1)}`);
  console.log(`demand R   ${spark(col('R'), -1, 1)}`);
  console.log(`first moves: ${p.log.slice(0, 14).join(', ')}`);
  const built = new Map<string, number>();
  for (const c of p.sim.state.civics.values()) built.set(c.def, (built.get(c.def) ?? 0) + 1);
  console.log(`built: ${[...built].map(([d, n]) => `${d}×${n}`).join(' ')}`);
  if (csvDir) {
    mkdirSync(csvDir, { recursive: true });
    const keys = Object.keys(samples[0]!) as (keyof Sample)[];
    writeFileSync(
      `${csvDir}/${id}.csv`,
      [keys.join(','), ...samples.map((s) => keys.map((k) => s[k]).join(','))].join('\n'),
    );
  }
}
