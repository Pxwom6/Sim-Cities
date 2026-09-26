import { ROAD_TYPES } from '../data/roads';
import { SNAP } from '../data/roads';
import { angleDiff, type Vec2 } from '../sim/geom';
import type { Network } from '../sim/world/network';

export interface SnapResult extends Vec2 {
  kind: 'node' | 'segment' | 'angle' | 'grid' | 'free';
  node?: number;
  seg?: number;
}

const DEG = Math.PI / 180;

/**
 * Input snapping for road drawing: existing nodes, then existing roads, then angles relative to
 * the start (world axes and the roads at the start node), then the 8 m grid. `scale` widens the
 * radii when zoomed out. The sim still validates the final geometry.
 */
export function snapPoint(
  net: Network,
  p: Vec2,
  opts: { from?: SnapResult | null; grid?: boolean; scale?: number; angles?: boolean },
): SnapResult {
  const k = Math.max(1, opts.scale ?? 1);
  const node = net.nearestNode(p, SNAP.node * k);
  if (node && (!opts.from || node.id !== opts.from.node))
    return { x: node.x, z: node.z, kind: 'node', node: node.id };
  const hit = net.nearestSegment(p, SNAP.segment * k, (id) => ROAD_TYPES[net.segment(id).type].buildable);
  if (
    hit &&
    (!opts.from || hit.seg !== opts.from.seg || Math.hypot(hit.x - opts.from.x, hit.z - opts.from.z) > 12)
  ) {
    return { x: hit.x, z: hit.z, kind: 'segment', seg: hit.seg };
  }
  const from = opts.from;
  if (from && opts.angles !== false) {
    const dx = p.x - from.x;
    const dz = p.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len > 4) {
      const ang = Math.atan2(dz, dx);
      const candidates: number[] = [];
      for (let q = 0; q < 8; q++) candidates.push((q * Math.PI) / 4);
      const refDirs: number[] = [];
      if (from.node !== undefined)
        for (const sid of net.segmentsAt(from.node)) {
          const d = net.directionAt(sid, from.node);
          refDirs.push(Math.atan2(d.z, d.x));
        }
      if (from.seg !== undefined && net.st.segments.has(from.seg)) {
        const c = net.curve(from.seg);
        const t = c.tangentAt(c.project(from).s);
        refDirs.push(Math.atan2(t.z, t.x));
      }
      for (const r of refDirs) for (let q = 0; q < 8; q++) candidates.push(r + (q * Math.PI) / 4);
      let best = Infinity;
      let bestAng = ang;
      for (const c of candidates) {
        const d = angleDiff(ang, c);
        if (d < best) {
          best = d;
          bestAng = c;
        }
      }
      if (best <= SNAP.angleDeg * DEG) {
        let l = len;
        if (opts.grid) l = Math.max(SNAP.grid, Math.round(l / SNAP.grid) * SNAP.grid);
        return { x: from.x + Math.cos(bestAng) * l, z: from.z + Math.sin(bestAng) * l, kind: 'angle' };
      }
    }
  }
  if (opts.grid)
    return {
      x: Math.round(p.x / SNAP.grid) * SNAP.grid,
      z: Math.round(p.z / SNAP.grid) * SNAP.grid,
      kind: 'grid',
    };
  return { x: p.x, z: p.z, kind: 'free' };
}

/** Fit a drawn polyline with a chain of quadratic pieces: returns [a, c, b, c, b, ...]. */
export function fitFreeform(path: Vec2[], spacing = 48): Vec2[] {
  if (path.length < 2) return path.slice();
  const cum = [0];
  for (let i = 1; i < path.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z));
  const total = cum[cum.length - 1]!;
  if (total < 1) return [path[0]!, path[path.length - 1]!];
  const at = (s: number): Vec2 => {
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const f = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
    return {
      x: path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * f,
      z: path[i - 1]!.z + (path[i]!.z - path[i - 1]!.z) * f,
    };
  };
  const pieces = Math.max(1, Math.round(total / spacing));
  const out: Vec2[] = [path[0]!];
  for (let k = 0; k < pieces; k++) {
    const s0 = (total * k) / pieces;
    const s1 = (total * (k + 1)) / pieces;
    const a = k === 0 ? path[0]! : at(s0);
    const b = k === pieces - 1 ? path[path.length - 1]! : at(s1);
    const m = at((s0 + s1) / 2);
    // Quadratic through m at t = ½: c = 2m − (a + b) / 2.
    out.push({ x: 2 * m.x - (a.x + b.x) / 2, z: 2 * m.z - (a.z + b.z) / 2 }, b);
  }
  return out;
}
