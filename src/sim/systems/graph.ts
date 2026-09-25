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

  run(
    g: RoadGraph,
    sources: { node: number; cost: number }[],
    maxCost: number,
    visit: (node: number, cost: number) => boolean,
    edgeCost?: (k: number) => number,
  ): void {
    const n = g.size;
    if (this.dist.length < n) {
      this.dist = new Float64Array(n);
      this.stamp = new Int32Array(n);
      this.done = new Int32Array(n);
      this.epoch = 0;
    }
    this.epoch++;
    const ep = this.epoch;
    const heap = this.heap;
    heap.clear();
    for (const s of sources) {
      if (this.stamp[s.node] !== ep || s.cost < this.dist[s.node]!) {
        this.stamp[s.node] = ep;
        this.dist[s.node] = s.cost;
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
      if (!visit(u, du)) break;
      for (let k = g.start[u]!; k < g.start[u + 1]!; k++) {
        const v = g.to[k]!;
        const nd = du + (edgeCost ? edgeCost(k) : g.cost[k]!);
        if (this.stamp[v] !== ep || nd < this.dist[v]!) {
          this.stamp[v] = ep;
          this.dist[v] = nd;
          heap.push(nd, v);
        }
      }
    }
  }
}
