import { CIVIC, SERVICES, SERVICE_KINDS, type ServiceKind } from '../../data/civic';
import { ROAD_TYPES } from '../../data/roads';
import { ZONE_R } from '../../data/zones';
import type { Sim } from '../sim';
import { BState, type Building } from '../world/buildings';
import { civicDef, findAccess, type Civic } from '../world/civic';
import { attachmentOf } from './commute';
import { Dijkstra, type RoadGraph } from './graph';

const dijkstra = new Dijkstra();

/** Coverage value for a travel time t within range T (full within `fullShare` of T). */
export function coverageAt(t: number, range: number, eff: number): number {
  const full = range * SERVICES.fullShare;
  if (t <= full) return eff;
  if (t >= range) return 0;
  return eff * (1 - (t - full) / (range - full));
}

/** Coverage samples are taken every this many metres along each road. */
export const COVERAGE_STEP = 24;

/**
 * Service coverage sampled along the roads: per kind, per segment id, values at evenly spaced
 * points from end a (index 0) to end b. Sampling along segments (not just at junctions) lets
 * coverage fade smoothly along long roads.
 */
export interface Coverage {
  graph: RoadGraph;
  kinds: Record<ServiceKind, Map<number, Float32Array>>;
}

/** Node index a civic building starts from, and the seconds to reach it. */
export function civicStart(
  sim: Sim,
  g: RoadGraph,
  c: { access: { seg: number; s: number } | null },
): { node: number; cost: number }[] {
  if (!c.access) return [];
  const seg = sim.state.net.segments.get(c.access.seg);
  if (!seg) return [];
  const len = sim.net.curve(seg.id).length;
  const v = ROAD_TYPES[seg.type].speed / 3.6;
  const a = g.index.get(seg.a);
  const b = g.index.get(seg.b);
  const out: { node: number; cost: number }[] = [];
  if (a !== undefined) out.push({ node: a, cost: c.access.s / v });
  if (b !== undefined) out.push({ node: b, cost: (len - c.access.s) / v });
  return out;
}

function samplesFor(len: number): number {
  return Math.max(2, Math.ceil(len / COVERAGE_STEP) + 1);
}

/**
 * Coverage from one service building, max-combined into `into`: a bounded Dijkstra in travel
 * time gives the seconds to each junction; each road touching a reached junction is sampled at
 * min(time via end a, time via end b, time straight from the building if it fronts that road).
 */
export function stationCoverage(
  sim: Sim,
  g: RoadGraph,
  c: Pick<Civic, 'access' | 'def'>,
  into: Map<number, Float32Array>,
): void {
  const def = CIVIC.get(c.def)!;
  const svc = def.service;
  if (!svc || !c.access) return;
  const eff = Math.min(1.25, sim.fundingEff(def.dept));
  const range = svc.range * (0.85 + 0.15 * eff);
  const value = Math.min(1, eff);
  const times = new Map<number, number>();
  dijkstra.run(g, civicStart(sim, g, c), range, (node, t) => {
    times.set(node, t);
    return true;
  });
  const segs = new Set<number>([c.access.seg]);
  for (const node of times.keys()) for (const id of sim.net.segmentsAt(g.ids[node]!)) segs.add(id);
  for (const id of [...segs].sort((a, b) => a - b)) {
    const seg = sim.state.net.segments.get(id);
    if (!seg || seg.type === 'highway') continue;
    const len = sim.net.curve(id).length;
    const v = ROAD_TYPES[seg.type].speed / 3.6;
    const ta = times.get(g.index.get(seg.a) ?? -1) ?? Infinity;
    const tb = times.get(g.index.get(seg.b) ?? -1) ?? Infinity;
    const own = id === c.access.seg ? c.access.s : -1;
    const n = samplesFor(len);
    let arr = into.get(id);
    for (let i = 0; i < n; i++) {
      const s = (len * i) / (n - 1);
      let t = Math.min(ta + s / v, tb + (len - s) / v);
      if (own >= 0) t = Math.min(t, Math.abs(s - own) / v);
      if (t >= range) continue;
      const cv = coverageAt(t, range, value);
      if (!arr) {
        arr = new Float32Array(n);
        into.set(id, arr);
      }
      if (cv > arr[i]!) arr[i] = cv;
    }
  }
}

/** Coverage at distance s along a segment, interpolated between samples. */
export function coverageOnSegment(
  cov: Coverage,
  kind: ServiceKind,
  seg: number,
  s: number,
  len: number,
): number {
  const arr = cov.kinds[kind].get(seg);
  if (!arr) return 0;
  const f = Math.max(0, Math.min(1, s / Math.max(1e-6, len))) * (arr.length - 1);
  const i = Math.min(arr.length - 2, Math.floor(f));
  const k = f - i;
  return arr[i]! * (1 - k) + arr[i + 1]! * k;
}

/**
 * Service coverage along every road (DESIGN §3.7). A pure function of the roads, service
 * buildings and funding, so the sim caches it and drops the cache whenever one of those changes.
 */
export function computeCoverage(sim: Sim): Coverage {
  const g = sim.graph();
  const kinds = {} as Record<ServiceKind, Map<number, Float32Array>>;
  for (const k of SERVICE_KINDS) kinds[k] = new Map();
  const civics = [...sim.state.civics.values()].sort((a, b) => a.id - b.id);
  for (const c of civics) {
    const svc = civicDef(c).service;
    if (svc) stationCoverage(sim, g, c, kinds[svc.kind]);
  }
  return { graph: g, kinds };
}

/** Hourly: buildings read coverage at their road node; schools fill their nearest seats first. */
export function applyCoverage(sim: Sim, cov: Coverage): void {
  const g = cov.graph;
  const civics = [...sim.state.civics.values()].sort((a, b) => a.id - b.id);
  // Seats: each school fills its nearest students first.
  const students = new Map<number, number>();
  const seated = new Map<number, number>();
  const attach = new Map<number, number>();
  for (const b of sim.state.buildings.values()) {
    const att = b.state !== BState.Rubble ? attachmentOf(sim, g, b) : null;
    if (att) attach.set(b.id, att.node);
    if (b.zone === ZONE_R && b.state === BState.Active && b.pop > 0)
      students.set(b.id, Math.round(b.pop * 0.2));
  }
  const byNode = new Map<number, Building[]>();
  for (const b of sim.state.buildings.values()) {
    const n = attach.get(b.id);
    if (n === undefined || !students.get(b.id)) continue;
    const list = byNode.get(n) ?? [];
    list.push(b);
    byNode.set(n, list);
  }
  for (const c of civics) {
    const def = civicDef(c);
    const svc = def.service;
    if (!svc || svc.kind !== 'education' || !svc.capacity) continue;
    let seats = Math.round(svc.capacity * Math.min(1.25, sim.fundingEff(def.dept)));
    dijkstra.run(g, civicStart(sim, g, c), svc.range, (node) => {
      for (const b of byNode.get(node) ?? []) {
        const want = (students.get(b.id) ?? 0) - (seated.get(b.id) ?? 0);
        if (want <= 0) continue;
        const take = Math.min(want, seats);
        seated.set(b.id, (seated.get(b.id) ?? 0) + take);
        seats -= take;
        if (seats <= 0) return false;
      }
      return true;
    });
  }
  for (const b of sim.state.buildings.values()) {
    const acc = b.state !== BState.Rubble ? sim.buildingAccess(b) : null;
    const len = acc ? sim.net.curve(acc.seg).length : 0;
    const at = (k: ServiceKind) => (acc ? round(coverageOnSegment(cov, k, acc.seg, acc.s, len)) : 0);
    b.covFire = at('fire');
    b.covPolice = at('police');
    b.covHealth = at('health');
    b.covPark = at('park');
    const edu = at('education');
    const st = students.get(b.id) ?? 0;
    b.covEdu = !acc ? 0 : st > 0 ? round(((seated.get(b.id) ?? 0) / st) * Math.max(0.5, edu)) : edu;
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Coverage at a world point, read off the nearest road. */
export function coverageNear(
  sim: Sim,
  cov: Coverage | null,
  x: number,
  z: number,
  kind: ServiceKind,
): number {
  if (!cov) return 0;
  const hit = sim.net.nearestSegment({ x, z }, 70);
  if (!hit) return 0;
  return coverageOnSegment(cov, kind, hit.seg, hit.s, sim.net.curve(hit.seg).length);
}

/** Coverage a hypothetical service building would give, as samples along each road (placement preview). */
export function coveragePreview(
  sim: Sim,
  def: string,
  x: number,
  z: number,
  angle: number,
  side: 1 | -1,
): { seg: number; v: number[] }[] {
  const d = CIVIC.get(def);
  if (!d?.service) return [];
  const access = findAccess(sim, { x, z, angle, side, def });
  if (!access) return [];
  const into = new Map<number, Float32Array>();
  stationCoverage(sim, sim.graph(), { access, def }, into);
  return [...into].map(([seg, arr]) => ({ seg, v: [...arr].map(round) }));
}
