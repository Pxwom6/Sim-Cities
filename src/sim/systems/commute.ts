import { COMMUTE, DEMAND } from '../../data/balance';
import { ROAD_TYPES } from '../../data/roads';
import { ZONE_C, ZONE_I, ZONE_R } from '../../data/zones';
import type { Sim } from '../sim';
import { BState, accessOf, type Building } from '../world/buildings';
import { Dijkstra, type RoadGraph } from './graph';

/** Where a building joins the graph: nearest end node and the travel seconds to it. */
export interface Attachment {
  node: number; // graph index
  offset: number; // seconds
}

export function attachmentOf(sim: Sim, g: RoadGraph, b: Building): Attachment | null {
  const acc = accessOf(sim, b);
  if (!acc) return null;
  const seg = sim.state.net.segments.get(acc.seg);
  if (!seg) return null;
  const len = sim.net.curve(seg.id).length;
  const speed = ROAD_TYPES[seg.type].speed / 3.6;
  const toA = acc.s;
  const toB = len - acc.s;
  const nodeId = toA <= toB ? seg.a : seg.b;
  const idx = g.index.get(nodeId);
  if (idx === undefined) return null;
  return { node: idx, offset: Math.min(toA, toB) / speed + COMMUTE.accessSeconds };
}

const dijkstra = new Dijkstra();

/**
 * Nearest-first matching of workers to jobs and shoppers to shops over the road graph
 * (DESIGN §3.8). Each origin node pools its residential buildings; a Dijkstra in travel time
 * fills open slots in order of distance. Origins take turns going first each round.
 */
export function runMatcher(sim: Sim): void {
  const g = sim.graph();
  const s = sim.state;
  const jobsAt = new Map<number, { b: Building; att: Attachment; open: number }[]>();
  const shopsAt = new Map<number, { b: Building; att: Attachment; open: number }[]>();
  const origins = new Map<
    number,
    {
      list: { b: Building; att: Attachment; workers: number; shoppers: number }[];
      workers: number;
      shoppers: number;
    }
  >();
  for (const b of s.buildings.values()) {
    if (b.state !== BState.Active) continue;
    const att = attachmentOf(sim, g, b);
    if (b.zone === ZONE_R) {
      b.employed = 0;
      b.commute = 0;
      b.shop = 0;
      const workers = Math.round(b.pop * DEMAND.workforceShare);
      b.seekers = workers;
      if (!att || b.pop <= 0) continue;
      const shoppers = b.pop;
      let o = origins.get(att.node);
      if (!o) origins.set(att.node, (o = { list: [], workers: 0, shoppers: 0 }));
      o.list.push({ b, att, workers, shoppers });
      o.workers += workers;
      o.shoppers += shoppers;
    } else if (b.zone === ZONE_C || b.zone === ZONE_I) {
      b.pop = 0;
      if (b.zone === ZONE_C) b.shop = 0;
      if (!att) continue;
      const list = jobsAt.get(att.node) ?? [];
      list.push({ b, att, open: b.cap });
      jobsAt.set(att.node, list);
      if (b.zone === ZONE_C) {
        const sl = shopsAt.get(att.node) ?? [];
        sl.push({ b, att, open: b.cap * COMMUTE.customersPerJob });
        shopsAt.set(att.node, sl);
      }
    }
  }
  const order = [...origins.keys()].sort((a, b) => a - b);
  if (!order.length) return;
  const startAt = s.cursors.matchRound % order.length;
  s.cursors.matchRound++;
  const customers = new Map<number, number>();
  for (let k = 0; k < order.length; k++) {
    const node = order[(startAt + k) % order.length]!;
    const o = origins.get(node)!;
    let workersLeft = o.workers;
    let shoppersLeft = o.shoppers;
    let employed = 0;
    let commuteSum = 0;
    let shopped = 0;
    const baseOffset = o.list.reduce((sum, e) => sum + e.att.offset, 0) / o.list.length;
    dijkstra.run(g, [{ node, cost: baseOffset }], COMMUTE.maxCommute, (u, cost) => {
      const jobs = jobsAt.get(u);
      if (jobs && workersLeft > 0) {
        for (const j of jobs) {
          if (j.open <= 0 || workersLeft <= 0) continue;
          const t = cost + j.att.offset;
          if (t > COMMUTE.maxCommute) continue;
          const take = Math.min(j.open, workersLeft);
          j.open -= take;
          j.b.pop += take;
          workersLeft -= take;
          employed += take;
          commuteSum += take * t;
        }
      }
      const shops = shopsAt.get(u);
      if (shops && shoppersLeft > 0 && cost <= COMMUTE.maxShopTrip) {
        for (const sh of shops) {
          if (sh.open <= 0 || shoppersLeft <= 0) continue;
          const take = Math.min(sh.open, shoppersLeft);
          sh.open -= take;
          shoppersLeft -= take;
          shopped += take;
          customers.set(sh.b.id, (customers.get(sh.b.id) ?? 0) + take);
        }
      }
      return workersLeft > 0 || shoppersLeft > 0;
    });
    // Share results among the origin's buildings (largest remainder, deterministic).
    const avgCommute = employed > 0 ? commuteSum / employed : 0;
    distribute(
      o.list,
      employed,
      (e) => e.workers,
      (e, v) => (e.b.employed = v),
    );
    const shopShare = o.shoppers > 0 ? shopped / o.shoppers : 0;
    for (const e of o.list) {
      e.b.commute = e.b.employed > 0 ? avgCommute : 0;
      e.b.shop = shopShare;
    }
  }
  for (const list of shopsAt.values()) {
    for (const sh of list) {
      const capacity = sh.b.cap * COMMUTE.customersPerJob;
      sh.b.shop = capacity > 0 ? (customers.get(sh.b.id) ?? 0) / capacity : 0;
    }
  }
}

function distribute<T>(
  items: T[],
  total: number,
  weight: (t: T) => number,
  set: (t: T, v: number) => void,
): void {
  const sum = items.reduce((s, t) => s + weight(t), 0);
  if (sum <= 0) {
    for (const t of items) set(t, 0);
    return;
  }
  let given = 0;
  const rems: { t: T; r: number; i: number }[] = [];
  items.forEach((t, i) => {
    const exact = (total * weight(t)) / sum;
    const v = Math.floor(exact);
    set(t, v);
    given += v;
    rems.push({ t, r: exact - v, i });
  });
  rems.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < total - given && k < rems.length; k++) {
    const e = rems[k]!;
    set(e.t, Math.floor((total * weight(e.t)) / sum) + 1);
  }
}
