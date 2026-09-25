import { ROAD_TYPES } from '../../data/roads';
import type { Network } from '../world/network';

/**
 * Compact adjacency (CSR) of the road network with free-flow travel times, rebuilt whenever the
 * network changes, plus connected components. Used by the matcher, coverage and utilities.
 */
export class RoadGraph {
  readonly ids: number[] = [];
  readonly index = new Map<number, number>();
  start = new Int32Array(1);
  to = new Int32Array(0);
  /** Node each edge leaves from (edges are stored per source node). */
  from = new Int32Array(0);
  seg = new Int32Array(0);
  /** Free-flow seconds per edge. */
  cost = new Float64Array(0);
  length = new Float64Array(0);
  component = new Int32Array(0);
  /** Per-segment free-flow seconds and length, keyed by segment id. */
  readonly segSeconds = new Map<number, number>();

  constructor(net: Network) {
    const nodes = [...net.st.nodes.keys()].sort((a, b) => a - b);
    nodes.forEach((id, i) => {
      this.ids.push(id);
      this.index.set(id, i);
    });
    const n = nodes.length;
    const deg = new Int32Array(n);
    const segs = [...net.st.segments.values()].sort((a, b) => a.id - b.id);
    for (const s of segs) {
      deg[this.index.get(s.a)!]!++;
      deg[this.index.get(s.b)!]!++;
    }
    this.start = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.start[i + 1] = this.start[i]! + deg[i]!;
    const m = this.start[n]!;
    this.to = new Int32Array(m);
    this.from = new Int32Array(m);
    this.seg = new Int32Array(m);
    this.cost = new Float64Array(m);
    this.length = new Float64Array(m);
    const fill = new Int32Array(n);
    for (const s of segs) {
      const len = net.curve(s.id).length;
      const sec = len / (ROAD_TYPES[s.type].speed / 3.6);
      this.segSeconds.set(s.id, sec);
      const a = this.index.get(s.a)!;
      const b = this.index.get(s.b)!;
      for (const [u, v] of [
        [a, b],
        [b, a],
      ] as const) {
        const k = this.start[u]! + fill[u]!++;
        this.to[k] = v;
        this.from[k] = u;
        this.seg[k] = s.id;
        this.cost[k] = sec;
        this.length[k] = len;
      }
    }
    this.component = new Int32Array(n).fill(-1);
    let comp = 0;
    const stack: number[] = [];
    for (let i = 0; i < n; i++) {
      if (this.component[i]! >= 0) continue;
      this.component[i] = comp;
      stack.push(i);
      while (stack.length) {
        const u = stack.pop()!;
        for (let k = this.start[u]!; k < this.start[u + 1]!; k++) {
          const v = this.to[k]!;
          if (this.component[v]! < 0) {
            this.component[v] = comp;
            stack.push(v);
          }
        }
      }
      comp++;
    }
  }

  get size(): number {
    return this.ids.length;
  }

  componentOfNode(nodeId: number): number {
    const i = this.index.get(nodeId);
    return i === undefined ? -1 : this.component[i]!;
  }
}

/** Binary min-heap of (key, node) pairs with deterministic tie-breaking on node index. */
export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  clear(): void {
    this.keys.length = 0;
    this.vals.length = 0;
  }

  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! < key || (k[p] === key && v[p]! <= val)) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  /** Pops the smallest; returns the node and writes its key into `out[0]`. */
  pop(out: number[]): number {
    const k = this.keys;
    const v = this.vals;
    const topK = k[0]!;
    const topV = v[0]!;
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastK;
        let mv = lastV;
        if (l < n && (k[l]! < mk || (k[l] === mk && v[l]! < mv))) {
          m = l;
          mk = k[l]!;
          mv = v[l]!;
        }
        if (r < n && (k[r]! < mk || (k[r] === mk && v[r]! < mv))) {
          m = r;
        }
        if (m === i) break;
        k[i] = k[m]!;
        v[i] = v[m]!;
        i = m;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    out[0] = topK;
    return topV;
  }
}

/**
 * Reusable Dijkstra over a RoadGraph. `run` calls `visit(node, cost)` in increasing cost order
 * until `visit` returns false or `maxCost` is exceeded.
 */
export class Dijkstra {
  private dist = new Float64Array(0);
  private stamp = new Int32Array(0);
  private done = new Int32Array(0);
  private epoch = 0;
  private heap = new MinHeap();
  private out = [0];
  /** With `track`: the edge each settled node was reached by (−1 for sources)... */
  pred = new Int32Array(0);
  /** ...and the settled nodes in order (the first `settledCount` entries). */
  settled = new Int32Array(0);
  settledCount = 0;

  run(
    g: RoadGraph,
    sources: { node: number; cost: number }[],
    maxCost: number,
    visit: (node: number, cost: number) => boolean,
    edgeCost?: ((k: number) => number) | Float64Array,
    track = false,
  ): void {
    const n = g.size;
    if (this.dist.length < n) {
      this.dist = new Float64Array(n);
      this.stamp = new Int32Array(n);
      this.done = new Int32Array(n);
      this.pred = new Int32Array(n);
      this.settled = new Int32Array(n);
      this.epoch = 0;
    }
    this.settledCount = 0;
    const costArr = edgeCost instanceof Float64Array ? edgeCost : null;
    const costFn = typeof edgeCost === 'function' ? edgeCost : null;
    this.epoch++;
    const ep = this.epoch;
    const heap = this.heap;
    heap.clear();
    for (const s of sources) {
      if (this.stamp[s.node] !== ep || s.cost < this.dist[s.node]!) {
        this.stamp[s.node] = ep;
        this.dist[s.node] = s.cost;
        if (track) this.pred[s.node] = -1;
        heap.push(s.cost, s.node);
      }
    }
    while (heap.size) {
      const u = heap.pop(this.out);
      const du = this.out[0]!;
      if (this.done[u] === ep) continue;
      if (du > this.dist[u]!) continue;
      this.done[u] = ep;
      if (du > maxCost) break;
      if (track) this.settled[this.settledCount++] = u;
      if (!visit(u, du)) break;
      for (let k = g.start[u]!; k < g.start[u + 1]!; k++) {
        const v = g.to[k]!;
        const nd = du + (costArr ? costArr[k]! : costFn ? costFn(k) : g.cost[k]!);
        if (this.stamp[v] !== ep || nd < this.dist[v]!) {
          this.stamp[v] = ep;
          this.dist[v] = nd;
          if (track) this.pred[v] = k;
          heap.push(nd, v);
        }
      }
    }
  }
}

/** A stretch of road a vehicle drives: along `seg` from arc length s0 to s1 (s1 < s0 = backwards). */
export interface Leg {
  seg: number;
  s0: number;
  s1: number;
}

/**
 * Shortest route (by travel time) between two points on the road network, as legs.
 * `edgeCost(k)` defaults to free-flow seconds; `segSpeed(seg)` gives m/s for partial legs.
 */
export function routeBetween(
  g: RoadGraph,
  net: { segment(id: number): { a: number; b: number }; curve(id: number): { length: number } },
  from: { seg: number; s: number },
  to: { seg: number; s: number },
  segSpeed: (seg: number) => number,
  edgeCost?: (k: number) => number,
  maxCost = Infinity,
): Leg[] | null {
  if (from.seg === to.seg) return [{ seg: from.seg, s0: from.s, s1: to.s }];
  const sa = net.segment(from.seg);
  const ta = net.segment(to.seg);
  const lenA = net.curve(from.seg).length;
  const lenB = net.curve(to.seg).length;
  const va = segSpeed(from.seg);
  const vb = segSpeed(to.seg);
  const n = g.size;
  const dist = new Float64Array(n).fill(Infinity);
  const pred = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heap = new MinHeap();
  const ia = g.index.get(sa.a)!;
  const ib = g.index.get(sa.b)!;
  dist[ia] = from.s / va;
  dist[ib] = Math.min(dist[ib]!, (lenA - from.s) / va);
  heap.push(dist[ia]!, ia);
  heap.push(dist[ib]!, ib);
  const tA = g.index.get(ta.a)!;
  const tB = g.index.get(ta.b)!;
  const endCost = (node: number) => (node === tA ? to.s / vb : node === tB ? (lenB - to.s) / vb : Infinity);
  let best = Infinity;
  let bestNode = -1;
  const out = [0];
  while (heap.size) {
    const u = heap.pop(out);
    const du = out[0]!;
    if (done[u]) continue;
    done[u] = 1;
    if (du >= best || du > maxCost) break;
    const e = endCost(u);
    if (du + e < best) {
      best = du + e;
      bestNode = u;
    }
    for (let k = g.start[u]!; k < g.start[u + 1]!; k++) {
      if (g.seg[k] === from.seg || g.seg[k] === to.seg) continue;
      const v = g.to[k]!;
      const nd = du + (edgeCost ? edgeCost(k) : g.cost[k]!);
      if (nd < dist[v]!) {
        dist[v] = nd;
        pred[v] = k;
        heap.push(nd, v);
      }
    }
  }
  if (bestNode < 0) return null;
  // Walk back to a source node.
  const edges: number[] = [];
  let cur = bestNode;
  while (pred[cur]! >= 0) {
    const k = pred[cur]!;
    edges.push(k);
    // Find the edge's origin: the node u with to[k] = cur.
    let u = 0;
    for (let lo = 0, hi = n; lo < hi;) {
      const m = (lo + hi) >> 1;
      if (g.start[m + 1]! <= k) lo = m + 1;
      else hi = m;
      u = lo;
    }
    cur = u;
  }
  edges.reverse();
  const legs: Leg[] = [];
  const startNode = cur;
  legs.push({ seg: from.seg, s0: from.s, s1: g.ids[startNode] === sa.a ? 0 : lenA });
  let at = startNode;
  for (const k of edges) {
    const segId = g.seg[k]!;
    const seg = net.segment(segId);
    const len = g.length[k]!;
    const forward = g.ids[at] === seg.a;
    legs.push({ seg: segId, s0: forward ? 0 : len, s1: forward ? len : 0 });
    at = g.to[k]!;
  }
  legs.push({ seg: to.seg, s0: g.ids[at] === ta.a ? 0 : lenB, s1: to.s });
  return legs.filter((l) => Math.abs(l.s1 - l.s0) > 0.01 || legs.length === 1);
}
