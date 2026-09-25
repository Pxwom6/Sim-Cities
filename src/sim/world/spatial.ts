/**
 * Uniform-grid spatial hash over axis-aligned boxes. Query results are sorted so that nothing
 * downstream depends on insertion order (which differs between a live sim and a loaded one).
 */
export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export class SpatialHash {
  private buckets = new Map<number, Set<number>>();
  private boxes = new Map<number, Box>();

  constructor(private size: number) {}

  private key(i: number, j: number): number {
    return (i + 1000) * 4096 + (j + 1000);
  }

  insert(id: number, box: Box): void {
    this.remove(id);
    this.boxes.set(id, box);
    const s = this.size;
    for (let i = Math.floor(box.minX / s); i <= Math.floor(box.maxX / s); i++) {
      for (let j = Math.floor(box.minZ / s); j <= Math.floor(box.maxZ / s); j++) {
        const k = this.key(i, j);
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, (b = new Set()));
        b.add(id);
      }
    }
  }

  remove(id: number): void {
    const box = this.boxes.get(id);
    if (!box) return;
    this.boxes.delete(id);
    const s = this.size;
    for (let i = Math.floor(box.minX / s); i <= Math.floor(box.maxX / s); i++) {
      for (let j = Math.floor(box.minZ / s); j <= Math.floor(box.maxZ / s); j++) {
        const k = this.key(i, j);
        const b = this.buckets.get(k);
        if (!b) continue;
        b.delete(id);
        if (!b.size) this.buckets.delete(k);
      }
    }
  }

  /** Ids whose boxes overlap the query box, sorted ascending. */
  query(box: Box): number[] {
    const s = this.size;
    const found = new Set<number>();
    for (let i = Math.floor(box.minX / s); i <= Math.floor(box.maxX / s); i++) {
      for (let j = Math.floor(box.minZ / s); j <= Math.floor(box.maxZ / s); j++) {
        const b = this.buckets.get(this.key(i, j));
        if (!b) continue;
        for (const id of b) {
          if (found.has(id)) continue;
          const o = this.boxes.get(id)!;
          if (o.maxX < box.minX || o.minX > box.maxX || o.maxZ < box.minZ || o.minZ > box.maxZ) continue;
          found.add(id);
        }
      }
    }
    return [...found].sort((a, b) => a - b);
  }

  queryPoint(x: number, z: number, r: number): number[] {
    return this.query({ minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r });
  }

  clear(): void {
    this.buckets.clear();
    this.boxes.clear();
  }

  get size_(): number {
    return this.boxes.size;
  }
}
