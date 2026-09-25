import { BufferAttribute, BufferGeometry, Color } from 'three';

/** Convert to non-indexed and paint every vertex one colour. */
export function painted(geo: BufferGeometry, color: Color | string): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = typeof color === 'string' ? new Color(color) : color;
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Merge non-indexed geometries that share position/normal/color (and optionally other) attributes. */
export function mergeGeometries(list: BufferGeometry[]): BufferGeometry {
  const names = Object.keys(list[0]!.attributes);
  let count = 0;
  for (const g of list) count += g.getAttribute('position').count;
  const out = new BufferGeometry();
  for (const name of names) {
    const size = list[0]!.getAttribute(name).itemSize;
    const arr = new Float32Array(count * size);
    let off = 0;
    for (const g of list) {
      const a = g.getAttribute(name);
      arr.set(a.array as Float32Array, off);
      off += a.count * size;
    }
    out.setAttribute(name, new BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
