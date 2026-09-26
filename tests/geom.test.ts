import { describe, expect, it } from 'vitest';
import { Curve, bezierPoint, curveCrossings, rectsOverlap, splitBezier, v2 } from '../src/sim/geom';

describe('geometry', () => {
  it('straight curve has exact length and projection', () => {
    const c = new Curve(v2(0, 0), v2(50, 0), v2(100, 0));
    expect(c.length).toBeCloseTo(100, 6);
    const p = c.project(v2(30, 7));
    expect(p.s).toBeCloseTo(30, 4);
    expect(p.d).toBeCloseTo(7, 4);
    expect(c.pointAt(25).x).toBeCloseTo(25, 4);
  });

  it('splitting a quadratic preserves the curve exactly', () => {
    const a = v2(0, 0);
    const c = v2(60, 80);
    const b = v2(120, 0);
    const { left, right } = splitBezier(a, c, b, 0.3);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const pl = bezierPoint(left[0], left[1], left[2], t);
      const pg = bezierPoint(a, c, b, t * 0.3);
      expect(pl.x).toBeCloseTo(pg.x, 9);
      expect(pl.z).toBeCloseTo(pg.z, 9);
      const pr = bezierPoint(right[0], right[1], right[2], t);
      const pg2 = bezierPoint(a, c, b, 0.3 + t * 0.7);
      expect(pr.x).toBeCloseTo(pg2.x, 9);
    }
    const whole = new Curve(a, c, b, 0.5);
    const l = new Curve(left[0], left[1], left[2], 0.5);
    const r = new Curve(right[0], right[1], right[2], 0.5);
    expect(l.length + r.length).toBeCloseTo(whole.length, 1);
  });

  it('finds crossings between curves', () => {
    const h = new Curve(v2(0, 50), v2(50, 50), v2(100, 50));
    const v = new Curve(v2(40, 0), v2(40, 50), v2(40, 100));
    const x = curveCrossings(h, v);
    expect(x.length).toBe(1);
    expect(x[0]!.x).toBeCloseTo(40, 3);
    expect(x[0]!.sa).toBeCloseTo(40, 2);
    expect(x[0]!.sb).toBeCloseTo(50, 2);
  });

  it('reports curvature of tight curves', () => {
    const tight = new Curve(v2(0, 0), v2(10, 10), v2(0, 20));
    const gentle = new Curve(v2(0, 0), v2(100, 20), v2(200, 0));
    expect(tight.maxCurvature()).toBeGreaterThan(1 / 18);
    expect(gentle.maxCurvature()).toBeLessThan(1 / 18);
  });

  it('oriented rectangles overlap test', () => {
    expect(
      rectsOverlap({ x: 0, z: 0, hw: 4, hd: 4, angle: 0 }, { x: 7.9, z: 0, hw: 4, hd: 4, angle: 0 }),
    ).toBe(true);
    expect(
      rectsOverlap({ x: 0, z: 0, hw: 4, hd: 4, angle: 0 }, { x: 8.1, z: 0, hw: 4, hd: 4, angle: 0 }),
    ).toBe(false);
    expect(
      rectsOverlap({ x: 0, z: 0, hw: 4, hd: 4, angle: 0 }, { x: 9, z: 0, hw: 4, hd: 4, angle: Math.PI / 4 }),
    ).toBe(true);
  });
});
