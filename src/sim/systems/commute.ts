import { COMMUTE, DEMAND, TRAFFIC } from '../../data/balance';
import { ROAD_TYPES } from '../../data/roads';
import { ZONE_C, ZONE_I, ZONE_R } from '../../data/zones';
import type { Sim } from '../sim';
import { BState, accessOf, type Building } from '../world/buildings';
import { Dijkstra, type RoadGraph } from './graph';
import {
  FlowAccumulator,
  TripReservoir,
  applyVolumes,
  congestedEdgeCosts,
  legsThroughTree,
  type TripSample,
} from './traffic';

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

interface Slot {
  b: Building;
  att: Attachment;
  open: number;
}

/**
 * Nearest-first matching of workers to jobs and shoppers to shops over the road graph, and the
 * traffic those trips make (DESIGN §3.8). Each origin node pools its residential buildings; a
 * Dijkstra over rush-hour travel times fills open slots in order of time, and the trips are pushed
 * back along the search tree onto the roads. Freight then runs from industry to shops and to or
 * from the highway. Origins take turns going first each round.
 */
export function runMatcher(sim: Sim): void {
  const g = sim.graph();
  const s = sim.state;
  const costs = congestedEdgeCosts(sim, g, 1);
  const flows = new FlowAccumulator(g);
  const trips = new TripReservoir(sim);
  const jobsAt = new Map<number, Slot[]>();
  const shopsAt = new Map<number, Slot[]>();
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
      if (!att || b.closed) continue;
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
  const car = TRAFFIC.carShare / TRAFFIC.occupancy;
  if (order.length) {
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
      let pick = 0;
      const home = () => o.list[pick++ % o.list.length]!.b;
      dijkstra.run(
        g,
        [{ node, cost: baseOffset }],
        COMMUTE.maxCommute,
        (u, cost) => {
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
              const n = take * TRAFFIC.tripsPerWorker * car;
              flows.addLoad(u, n);
              flows.addSegment(accessOf(sim, j.b)?.seg ?? -1, n);
              trips.offer(n, () => trip(sim, g, home(), j.b, u, 'work'));
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
              const n = take * TRAFFIC.shopTripsPerResident * car;
              flows.addLoad(u, n);
              flows.addSegment(accessOf(sim, sh.b)?.seg ?? -1, n);
              trips.offer(n, () => trip(sim, g, home(), sh.b, u, 'shop'));
            }
          }
          return workersLeft > 0 || shoppersLeft > 0;
        },
        costs,
        true,
      );
      flows.accumulate(dijkstra);
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
        // Trips on the home's own street.
        const acc = accessOf(sim, e.b);
        if (acc)
          flows.addSegment(
            acc.seg,
            (e.b.employed * TRAFFIC.tripsPerWorker + e.shoppers * shopShare * TRAFFIC.shopTripsPerResident) *
              car,
          );
      }
    }
    for (const list of shopsAt.values()) {
      for (const sh of list) {
        const capacity = sh.b.cap * COMMUTE.customersPerJob;
        sh.b.shop = capacity > 0 ? (customers.get(sh.b.id) ?? 0) / capacity : 0;
      }
    }
  }
  runFreight(sim, g, costs, flows, trips, jobsAt);
  applyVolumes(sim, flows.next);
  sim.tripSamples = trips.samples;
  sim.trafficChanged();
}

/**
 * Freight: industry ships to the nearest shops that need goods; what's left is exported via the
 * highway, and shops that still need goods import them from the highway. Trucks count extra.
 */
function runFreight(
  sim: Sim,
  g: RoadGraph,
  costs: Float64Array,
  flows: FlowAccumulator,
  trips: TripReservoir,
  jobsAt: Map<number, Slot[]>,
): void {
  const pcu = TRAFFIC.truckPcu;
  const need = new Map<number, { b: Building; att: Attachment; open: number }[]>();
  const makers: { node: number; b: Building; out: number }[] = [];
  for (const [node, list] of [...jobsAt].sort((a, b) => a[0] - b[0])) {
    for (const j of list) {
      if (j.b.zone === ZONE_C) {
        const open = j.b.pop * TRAFFIC.freightPerCommercialJob;
        if (open > 0) {
          const l = need.get(node) ?? [];
          l.push({ b: j.b, att: j.att, open });
          need.set(node, l);
        }
      } else if (j.b.zone === ZONE_I && j.b.pop > 0) {
        makers.push({ node, b: j.b, out: j.b.pop * TRAFFIC.freightPerIndustrialJob });
      }
    }
  }
  const exports = new Map<number, { amount: number; b: Building }>();
  const byNode = new Map<number, { b: Building; out: number }[]>();
  for (const m of makers) {
    const l = byNode.get(m.node) ?? [];
    l.push(m);
    byNode.set(m.node, l);
  }
  for (const [node, list] of [...byNode].sort((a, b) => a[0] - b[0])) {
    let left = list.reduce((sum, m) => sum + m.out, 0);
    const from = list[0]!.b;
    dijkstra.run(
      g,
      [{ node, cost: 0 }],
      COMMUTE.maxCommute,
      (u) => {
        for (const c of need.get(u) ?? []) {
          if (c.open <= 0 || left <= 0) continue;
          const take = Math.min(c.open, left);
          c.open -= take;
          left -= take;
          flows.addLoad(u, take * pcu);
          trips.offer(take * pcu, () => trip(sim, g, from, c.b, u, 'freight'));
        }
        return left > 0;
      },
      costs,
      true,
    );
    flows.accumulate(dijkstra);
    for (const m of list) flows.addSegment(accessOf(sim, m.b)?.seg ?? -1, m.out * pcu);
    if (left > 0) exports.set(node, { amount: left, b: from });
  }
  // Exports and imports use one tree grown from the highway connection.
  const hw = sim.state.highway;
  const hwNode = g.index.get(hw.connect);
  if (hwNode === undefined) return;
  let external = 0;
  const loads: { node: number; amount: number; b: Building; purpose: 'export' | 'import' }[] = [];
  for (const [node, e] of exports) loads.push({ node, amount: e.amount, b: e.b, purpose: 'export' });
  for (const [node, list] of need)
    for (const c of list) if (c.open > 0) loads.push({ node, amount: c.open, b: c.b, purpose: 'import' });
  if (!loads.length) return;
  const reach = new Set<number>();
  dijkstra.run(
    g,
    [{ node: hwNode, cost: 0 }],
    Infinity,
    (u) => {
      reach.add(u);
      return true;
    },
    costs,
    true,
  );
  for (const l of loads) {
    if (!reach.has(l.node)) continue;
    external += l.amount;
    flows.addLoad(l.node, l.amount * pcu);
    flows.addSegment(accessOf(sim, l.b)?.seg ?? -1, l.amount * pcu);
    trips.offer(l.amount * pcu, () => {
      const legs = legsThroughTree(sim, g, dijkstra, null, l.node, accessOf(sim, l.b));
      const out = sim.net.curve(hw.segment).length;
      const hwSeg = sim.state.net.segments.get(hw.segment)!;
      const toOutside = hwSeg.a === hw.connect ? { s0: 0, s1: out } : { s0: out, s1: 0 };
      // The tree runs from the highway to the building; reverse it for exports.
      const inbound = [{ seg: hw.segment, s0: toOutside.s1, s1: toOutside.s0 }, ...legs];
      const outbound = [...inbound].reverse().map((x) => ({ seg: x.seg, s0: x.s1, s1: x.s0 }));
      return {
        from: l.b.id,
        to: 0,
        purpose: l.purpose,
        legs: l.purpose === 'export' ? outbound : inbound,
        weight: l.amount * pcu,
      };
    });
  }
  flows.accumulate(dijkstra);
  flows.addSegment(hw.segment, external * pcu);
}

/** A sampled trip from building `a` to building `b` (reached at node `u` of the current tree). */
function trip(
  sim: Sim,
  g: RoadGraph,
  a: Building,
  b: Building,
  u: number,
  purpose: 'work' | 'shop' | 'freight',
): TripSample | null {
  const legs = legsThroughTree(sim, g, dijkstra, accessOf(sim, a), u, accessOf(sim, b));
  return legs.length ? { from: a.id, to: b.id, purpose, legs, weight: 1 } : null;
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
