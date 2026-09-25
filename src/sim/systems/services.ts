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

export interface NodeCoverage {
  graph: RoadGraph;
  kinds: Record<ServiceKind, Float32Array>;
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

/** Coverage per road node for one service building (max-combined into `into`). */
export function stationCoverage(
  sim: Sim,
  g: RoadGraph,
  c: Pick<Civic, 'access' | 'def'>,
  into: Float32Array,
): void {
  const def = CIVIC.get(c.def)!;
  const svc = def.service;
  if (!svc) return;
  const eff = Math.min(1.25, sim.fundingEff(def.dept));
  const range = svc.range * (0.85 + 0.15 * Math.min(1.25, eff));
  dijkstra.run(g, civicStart(sim, g, c), range, (node, t) => {
    const v = coverageAt(t, range, Math.min(1, eff));
    if (v > into[node]!) into[node] = v;
    return true;
  });
}

/**
 * Recompute service coverage (DESIGN §3.7): per kind, a bounded Dijkstra in travel time from each
 * service building; buildings read the value at their road node. Education also allocates seats.
 */
export function updateCoverage(sim: Sim): NodeCoverage {
  const g = sim.graph();
  const kinds = {} as Record<ServiceKind, Float32Array>;
  for (const k of SERVICE_KINDS) kinds[k] = new Float32Array(g.size);
  const civics = [...sim.state.civics.values()].sort((a, b) => a.id - b.id);
  for (const c of civics) {
    const svc = civicDef(c).service;
    if (svc) stationCoverage(sim, g, c, kinds[svc.kind]);
  }
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
    const n = attach.get(b.id);
    b.covFire = n === undefined ? 0 : round(kinds.fire[n]!);
    b.covPolice = n === undefined ? 0 : round(kinds.police[n]!);
    b.covHealth = n === undefined ? 0 : round(kinds.health[n]!);
    b.covPark = n === undefined ? 0 : round(kinds.park[n]!);
    const st = students.get(b.id) ?? 0;
    b.covEdu =
      n === undefined
        ? 0
        : st > 0
          ? round(((seated.get(b.id) ?? 0) / st) * Math.max(0.5, kinds.education[n]!))
          : round(kinds.education[n]!);
  }
  return { graph: g, kinds };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Coverage near a world point (max over the nearest road's two ends). */
export function coverageNear(
  sim: Sim,
  cov: NodeCoverage | null,
  x: number,
  z: number,
  kind: ServiceKind,
): number {
  if (!cov) return 0;
  const hit = sim.net.nearestSegment({ x, z }, 70);
  if (!hit) return 0;
  const seg = sim.state.net.segments.get(hit.seg)!;
  const a = cov.graph.index.get(seg.a);
  const b = cov.graph.index.get(seg.b);
  return Math.max(a !== undefined ? cov.kinds[kind][a]! : 0, b !== undefined ? cov.kinds[kind][b]! : 0);
}

/** Coverage a hypothetical service building would give, per segment end (for the placement preview). */
export function coveragePreview(
  sim: Sim,
  def: string,
  x: number,
  z: number,
  angle: number,
  side: 1 | -1,
): { seg: number; a: number; b: number }[] {
  const d = CIVIC.get(def);
  if (!d?.service) return [];
  const access = findAccess(sim, { x, z, angle, side, def });
  if (!access) return [];
  const g = sim.graph();
  const into = new Float32Array(g.size);
  stationCoverage(sim, g, { access, def }, into);
  const out: { seg: number; a: number; b: number }[] = [];
  for (const seg of sim.state.net.segments.values()) {
    const ia = g.index.get(seg.a);
    const ib = g.index.get(seg.b);
    const a = ia !== undefined ? into[ia]! : 0;
    const b = ib !== undefined ? into[ib]! : 0;
    if (a > 0 || b > 0) out.push({ seg: seg.id, a: round(a), b: round(b) });
  }
  return out;
}
