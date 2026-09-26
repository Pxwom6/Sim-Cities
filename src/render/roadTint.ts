import { Color, Group, Mesh, MeshBasicMaterial } from 'three';
import { rampColor } from '../client/overlay';
import type { Curve, Vec2 } from '../sim/geom';
import { GeoBuffer, mergeChunks } from './geoBuffer';

export interface RoadTintPiece {
  curve: Curve;
  /** Values 0..1 at evenly spaced points from the curve's start to its end. */
  v: number[];
  half: number;
}

/**
 * Translucent ribbons laid over roads, shaded by a value that varies along each road: the
 * coverage preview when placing a service building, and the service coverage data maps.
 */
export class RoadTint {
  readonly group = new Group();
  private mesh: Mesh | null = null;
  private mat: MeshBasicMaterial;
  private get defaultRamp(): 'sequential' | 'diverging' | 'traffic' {
    return this.ramp;
  }
  /** Roads currently tinted (for tests and stats). */
  pieces = 0;

  constructor(
    private heightAt: (x: number, z: number) => number,
    private ramp: 'sequential' | 'diverging' | 'traffic',
    opacity: number,
    private skipBelow = -1,
  ) {
    this.mat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
  }

  show(list: RoadTintPiece[] | null, ramp = this.defaultRamp): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.pieces = list?.length ?? 0;
    if (!list?.length) return;
    const buf = new GeoBuffer(4096);
    const col = new Color();
    for (const { curve, v, half } of list) {
      const n = Math.max(1, Math.ceil(curve.length / 4));
      for (let i = 0; i < n; i++) {
        const s0 = (curve.length * i) / n;
        const s1 = (curve.length * (i + 1)) / n;
        const f = ((s0 + s1) / 2 / curve.length) * (v.length - 1);
        const k = Math.min(v.length - 2, Math.floor(f));
        const val = v[k]! + (v[k + 1]! - v[k]!) * (f - k);
        if (val <= this.skipBelow) continue;
        if (ramp === 'sequential') rampColor('sequential', 0.25 + val * 0.75, col);
        else rampColor(ramp, val, col);
        const a = curve.pointAt(s0);
        const b = curve.pointAt(s1);
        const ta = curve.tangentAt(s0);
        const tb = curve.tangentAt(s1);
        const pt = (p: Vec2, t: Vec2, o: number) => {
          const x = p.x + t.z * o;
          const z = p.z - t.x * o;
          return [x, Math.max(0, this.heightAt(x, z)) + 0.45, z];
        };
        buf.quad(pt(a, ta, -half), pt(a, ta, half), pt(b, tb, half), pt(b, tb, -half), col);
      }
    }
    if (!buf.n) return;
    this.mesh = new Mesh(mergeChunks([buf.trimmed()]), this.mat);
    this.mesh.renderOrder = 11;
    this.group.add(this.mesh);
  }
}
