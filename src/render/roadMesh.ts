import type { Curve, Vec2 } from '../sim/geom';
import type { GeoBuffer } from './geoBuffer';
import type { RoadStyle } from './roadStyle';

export type HeightFn = (x: number, z: number) => number;

/**
 * Ribbon for one segment between arc lengths [s0, s1], draped on the terrain: strips across the
 * width, kerb faces and dashed markings.
 */
export function buildSegmentRibbon(
  out: GeoBuffer,
  curve: Curve,
  style: RoadStyle,
  s0: number,
  s1: number,
  h: HeightFn,
): void {
  if (s1 - s0 < 0.2) return;
  const step = 2.5;
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const px: number[] = [];
  const pz: number[] = [];
  const nx: number[] = [];
  const nz: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const p = curve.pointAt(s);
    const t = curve.tangentAt(s);
    px.push(p.x);
    pz.push(p.z);
    nx.push(t.z);
    nz.push(-t.x);
  }
  const at = (i: number, off: number, lift: number): number[] => {
    const x = px[i]! + nx[i]! * off;
    const z = pz[i]! + nz[i]! * off;
    return [x, h(x, z) + lift, z];
  };
  for (const st of style.strips) {
    for (let i = 0; i < n; i++)
      out.quad(
        at(i, st.from, st.lift),
        at(i, st.to, st.lift),
        at(i + 1, st.to, st.lift),
        at(i + 1, st.from, st.lift),
        st.color,
      );
  }
  for (const k of style.kerbs) {
    for (let i = 0; i < n; i++) {
      out.quad(
        at(i, k.at, k.low),
        at(i + 1, k.at, k.low),
        at(i + 1, k.at, k.high),
        at(i, k.at, k.high),
        style.sidewalk,
        false,
      );
    }
  }
  for (const m of style.markings) {
    const period = m.dash + m.gap;
    let s = s0 + 1;
    while (s < s1 - 1) {
      const e = Math.min(s + m.dash, s1 - 1);
      const a = curve.pointAt(s);
      const b = curve.pointAt(e);
      const ta = curve.tangentAt(s);
      const tb = curve.tangentAt(e);
      const pts = [
        [a.x + ta.z * (m.offset - m.width / 2), a.z - ta.x * (m.offset - m.width / 2)],
        [a.x + ta.z * (m.offset + m.width / 2), a.z - ta.x * (m.offset + m.width / 2)],
        [b.x + tb.z * (m.offset + m.width / 2), b.z - tb.x * (m.offset + m.width / 2)],
        [b.x + tb.z * (m.offset - m.width / 2), b.z - tb.x * (m.offset - m.width / 2)],
      ].map(([x, z]) => [x!, h(x!, z!) + style.lift + 0.03, z!]);
      // Long solid lines: subdivide so they follow the terrain.
      if (e - s > 6) {
        const sub = Math.ceil((e - s) / 3);
        for (let k = 0; k < sub; k++) {
          const sa = s + ((e - s) * k) / sub;
          const sb = s + ((e - s) * (k + 1)) / sub;
          const pa = curve.pointAt(sa);
          const pb = curve.pointAt(sb);
          const qa = curve.tangentAt(sa);
          const qb = curve.tangentAt(sb);
          const q = [
            [pa.x + qa.z * (m.offset - m.width / 2), pa.z - qa.x * (m.offset - m.width / 2)],
            [pa.x + qa.z * (m.offset + m.width / 2), pa.z - qa.x * (m.offset + m.width / 2)],
            [pb.x + qb.z * (m.offset + m.width / 2), pb.z - qb.x * (m.offset + m.width / 2)],
            [pb.x + qb.z * (m.offset - m.width / 2), pb.z - qb.x * (m.offset - m.width / 2)],
          ].map(([x, z]) => [x!, h(x!, z!) + style.lift + 0.03, z!]);
          out.quad(q[0]!, q[1]!, q[2]!, q[3]!, m.color);
        }
      } else {
        out.quad(pts[0]!, pts[1]!, pts[2]!, pts[3]!, m.color);
      }
      s += period;
    }
  }
}

export interface Approach {
  /** Point on the segment centre line where the ribbon stops. */
  p: Vec2;
  /** Unit direction pointing away from the node. */
  dir: Vec2;
  style: RoadStyle;
}

/** Intersection polygon: asphalt fan through the approach edges plus sidewalk corner quads. */
export function buildJunction(out: GeoBuffer, centre: Vec2, approaches: Approach[], h: HeightFn): void {
  const list = [...approaches].sort((a, b) => Math.atan2(a.dir.z, a.dir.x) - Math.atan2(b.dir.z, b.dir.x));
  const lift = Math.max(...list.map((a) => a.style.lift));
  const walkLift = Math.max(...list.map((a) => a.style.sidewalkLift));
  const asphalt = list[0]!.style.asphalt;
  const edge = (a: Approach, sign: number, w: number): Vec2 => ({
    x: a.p.x + -a.dir.z * sign * w,
    z: a.p.z + a.dir.x * sign * w,
  });
  const ring: Vec2[] = [];
  for (const a of list) {
    ring.push(edge(a, -1, a.style.asphaltHalf), edge(a, 1, a.style.asphaltHalf));
  }
  const cy = h(centre.x, centre.z) + lift;
  const v = (p: Vec2, l: number) => [p.x, h(p.x, p.z) + l, p.z];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const start = out.n;
    out.tri(centre.x, cy, centre.z, a.x, h(a.x, a.z) + lift, a.z, b.x, h(b.x, b.z) + lift, b.z, asphalt);
    out.faceUp(start);
  }
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    const b = list[(i + 1) % list.length]!;
    if (a === b) continue;
    const ai = edge(a, 1, a.style.asphaltHalf);
    const ao = edge(a, 1, a.style.totalHalf);
    const bi = edge(b, -1, b.style.asphaltHalf);
    const bo = edge(b, -1, b.style.totalHalf);
    out.quad(v(ai, walkLift), v(ao, walkLift), v(bo, walkLift), v(bi, walkLift), a.style.sidewalk);
    // Kerb face along the corner.
    out.quad(v(ai, lift), v(bi, lift), v(bi, walkLift), v(ai, walkLift), a.style.sidewalk, false);
  }
}
