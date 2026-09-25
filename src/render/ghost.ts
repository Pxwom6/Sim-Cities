import {
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Material,
} from 'three';
import type { RoadTypeId } from '../data/roads';
import { Curve, v2, type Vec2 } from '../sim/geom';
import { GeoBuffer, mergeChunks } from './geoBuffer';
import { ROAD_STYLES } from './roadStyle';

const OK = new Color('#3fa7ff');
const BAD = new Color('#ff4d4d');
const WARN = new Color('#ffb020');

/** Translucent tool feedback: road ghosts, highlights, brush and snap markers. */
export class GhostRenderer {
  readonly group = new Group();
  private roadMesh: Mesh | null = null;
  private highlight: Mesh | null = null;
  private roadMat = new MeshBasicMaterial({
    color: OK,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  private hiMat = new MeshBasicMaterial({
    color: BAD,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  private brush: Mesh;
  private snap: Mesh;
  private marker: Mesh;

  constructor(private heightAt: (x: number, z: number) => number) {
    const ringMat = (c: Color, o: number): Material =>
      new MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: o,
        depthWrite: false,
        side: DoubleSide,
        depthTest: false,
      });
    this.brush = new Mesh(
      new RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2),
      ringMat(new Color('#ffffff'), 0.8),
    );
    this.snap = new Mesh(
      new RingGeometry(1.8, 2.6, 24).rotateX(-Math.PI / 2),
      ringMat(new Color('#ffe066'), 0.95),
    );
    this.marker = new Mesh(new RingGeometry(2.5, 4, 24).rotateX(-Math.PI / 2), ringMat(BAD, 0.9));
    for (const m of [this.brush, this.snap, this.marker]) {
      m.visible = false;
      m.renderOrder = 20;
      this.group.add(m);
    }
  }

  private y(x: number, z: number): number {
    return Math.max(0, this.heightAt(x, z));
  }

  private ribbon(pieces: { a: Vec2; c: Vec2; b: Vec2 }[], half: number): BufferGeometry | null {
    const buf = new GeoBuffer(512);
    const col = new Color('#ffffff');
    for (const p of pieces) {
      const curve = new Curve(p.a, p.c, p.b);
      const n = Math.max(1, Math.ceil(curve.length / 3));
      for (let i = 0; i < n; i++) {
        const s0 = (curve.length * i) / n;
        const s1 = (curve.length * (i + 1)) / n;
        const a = curve.pointAt(s0);
        const b = curve.pointAt(s1);
        const ta = curve.tangentAt(s0);
        const tb = curve.tangentAt(s1);
        const pt = (p: Vec2, t: Vec2, o: number) => {
          const x = p.x + t.z * o;
          const z = p.z - t.x * o;
          return [x, this.y(x, z) + 0.5, z];
        };
        buf.quad(pt(a, ta, -half), pt(a, ta, half), pt(b, tb, half), pt(b, tb, -half), col);
      }
    }
    return buf.n ? mergeChunks([buf.trimmed()]) : null;
  }

  showRoad(
    pieces: { a: Vec2; c: Vec2; b: Vec2 }[] | null,
    type: RoadTypeId,
    state: 'ok' | 'bad' | 'pending',
  ): void {
    if (this.roadMesh) {
      this.group.remove(this.roadMesh);
      this.roadMesh.geometry.dispose();
      this.roadMesh = null;
    }
    if (!pieces || !pieces.length) return;
    const geo = this.ribbon(pieces, ROAD_STYLES[type].totalHalf);
    if (!geo) return;
    this.roadMat.color.copy(state === 'ok' ? OK : state === 'bad' ? BAD : WARN);
    this.roadMesh = new Mesh(geo, this.roadMat);
    this.roadMesh.renderOrder = 10;
    this.group.add(this.roadMesh);
  }

  highlightSegment(curve: Curve | null, half: number, color: 'bad' | 'ok' = 'bad'): void {
    if (this.highlight) {
      this.group.remove(this.highlight);
      this.highlight.geometry.dispose();
      this.highlight = null;
    }
    if (!curve) return;
    const geo = this.ribbon([{ a: curve.a, c: curve.c, b: curve.b }], half + 0.6);
    if (!geo) return;
    this.hiMat.color.copy(color === 'bad' ? BAD : OK);
    this.highlight = new Mesh(geo, this.hiMat);
    this.highlight.renderOrder = 11;
    this.group.add(this.highlight);
  }

  private selection: Mesh | null = null;
  private selMat = new MeshBasicMaterial({
    color: new Color('#ffd23f'),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
  });

  /** Outline around a selected footprint (oriented rectangle). */
  showSelection(r: { x: number; z: number; hw: number; hd: number; angle: number } | null): void {
    if (this.selection) {
      this.group.remove(this.selection);
      this.selection.geometry.dispose();
      this.selection = null;
    }
    if (!r) return;
    const buf = new GeoBuffer(64);
    const c = Math.cos(r.angle);
    const s = Math.sin(r.angle);
    const w = 0.7;
    const pt = (u: number, v: number) => {
      const x = r.x + u * c - v * s;
      const z = r.z + u * s + v * c;
      return [x, this.y(x, z) + 0.6, z];
    };
    const hw = r.hw + 0.8;
    const hd = r.hd + 0.8;
    const col = new Color('#ffffff');
    buf.quad(pt(-hw, -hd), pt(hw, -hd), pt(hw, -hd + w), pt(-hw, -hd + w), col);
    buf.quad(pt(-hw, hd - w), pt(hw, hd - w), pt(hw, hd), pt(-hw, hd), col);
    buf.quad(pt(-hw, -hd), pt(-hw + w, -hd), pt(-hw + w, hd), pt(-hw, hd), col);
    buf.quad(pt(hw - w, -hd), pt(hw, -hd), pt(hw, hd), pt(hw - w, hd), col);
    this.selection = new Mesh(mergeChunks([buf.trimmed()]), this.selMat);
    this.selection.renderOrder = 30;
    this.group.add(this.selection);
  }

  private footprint: Mesh | null = null;
  private fpMat = new MeshBasicMaterial({
    color: OK,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });

  /** Translucent box over a footprint for building placement. */
  showFootprint(
    r: { x: number; z: number; hw: number; hd: number; angle: number } | null,
    state: 'ok' | 'bad' | 'pending',
    height = 6,
  ): void {
    if (this.footprint) {
      this.group.remove(this.footprint);
      this.footprint.geometry.dispose();
      this.footprint = null;
    }
    if (!r) return;
    const buf = new GeoBuffer(64);
    const c = Math.cos(r.angle);
    const s = Math.sin(r.angle);
    const base = Math.max(
      ...[-1, 1].flatMap((u) =>
        [-1, 1].map((v) => this.y(r.x + u * r.hw * c - v * r.hd * s, r.z + u * r.hw * s + v * r.hd * c)),
      ),
    );
    const pt = (u: number, v: number, y: number) => [r.x + u * c - v * s, base + y, r.z + u * s + v * c];
    const col = new Color('#ffffff');
    const { hw, hd } = r;
    buf.quad(pt(-hw, -hd, height), pt(-hw, hd, height), pt(hw, hd, height), pt(hw, -hd, height), col);
    buf.quad(pt(-hw, -hd, 0), pt(-hw, -hd, height), pt(hw, -hd, height), pt(hw, -hd, 0), col, false);
    buf.quad(pt(hw, hd, 0), pt(hw, hd, height), pt(-hw, hd, height), pt(-hw, hd, 0), col, false);
    buf.quad(pt(-hw, hd, 0), pt(-hw, hd, height), pt(-hw, -hd, height), pt(-hw, -hd, 0), col, false);
    buf.quad(pt(hw, -hd, 0), pt(hw, -hd, height), pt(hw, hd, height), pt(hw, hd, 0), col, false);
    this.fpMat.color.copy(state === 'ok' ? OK : state === 'bad' ? BAD : WARN);
    this.footprint = new Mesh(mergeChunks([buf.trimmed()]), this.fpMat);
    this.footprint.renderOrder = 12;
    this.group.add(this.footprint);
  }

  showBrush(p: Vec2 | null, radius: number, color = '#ffffff'): void {
    this.brush.visible = !!p;
    if (!p) return;
    this.brush.position.set(p.x, this.y(p.x, p.z) + 0.6, p.z);
    this.brush.scale.setScalar(radius);
    (this.brush.material as MeshBasicMaterial).color.set(color);
  }

  showSnap(p: Vec2 | null): void {
    this.snap.visible = !!p;
    if (p) this.snap.position.set(p.x, this.y(p.x, p.z) + 0.8, p.z);
  }

  showMarker(p: Vec2 | null): void {
    this.marker.visible = !!p;
    if (p) this.marker.position.set(p.x, this.y(p.x, p.z) + 0.9, p.z);
  }

  clear(): void {
    this.showRoad(null, 'street', 'ok');
    this.showFootprint(null, 'ok');
    this.highlightSegment(null, 0);
    this.showBrush(null, 1);
    this.showSnap(null);
    this.showMarker(null);
  }
}

export { v2 };
