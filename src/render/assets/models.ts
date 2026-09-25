import { Color } from 'three';
import type { ZonedDef } from '../../data/buildings';
import { CELL, ZONE_C, ZONE_I, ZONE_R } from '../../data/zones';
import { ModelBuilder, modelRng, pick, type ModelData } from './builder';

const C = (hex: string) => new Color(hex);
const WALLS_R = [
  '#f3e3c3',
  '#efd5b0',
  '#e8c9a3',
  '#dfe8d0',
  '#cfe0e8',
  '#f2d0c4',
  '#e9e4da',
  '#f5ecd9',
  '#e6d3e8',
].map(C);
const WALLS_R_RICH = ['#ffffff', '#f7f3ea', '#eef1f4', '#f4ead8'].map(C);
const ROOFS = ['#b5553b', '#8d4a3a', '#5b6470', '#7a5b45', '#4f6b5a', '#a0673f', '#6b4e3d'].map(C);
const TRIM = C('#fbf8f1');
const DOOR = C('#6b4a33');
const GLASS = C('#3d5a73');
const GLASS_SHOP = C('#6f9fc4');
const GRASS = C('#8cc063');
const GRASS_RICH = C('#7fbb5c');
const PAVE = C('#cfcac0');
const CONCRETE = C('#b9b6ae');
const ASPHALT_LOT = C('#8a8d91');
const STONE = C('#bdb5a6');
const HEDGE = C('#4f8f45');
const POOL = C('#5ec3e8');
const WALLS_C = ['#e7e2da', '#d9dfe6', '#f0e4d0', '#cfd8d4', '#e9d8c8', '#dde3ea'].map(C);
const AWNINGS = ['#d9534f', '#2f86c9', '#3aa876', '#f0ad4e', '#8e5bb5', '#e2744a'].map(C);
const SIGNS = ['#ffcf3f', '#ff6f59', '#5ad1ff', '#9bf07a', '#ff8fd8'].map(C);
const OFFICE_GLASS = ['#6f9fc4', '#7fb0c9', '#5f88a8', '#86a8bd', '#7a9eb0'].map(C);
const WALLS_I = ['#c9c4ba', '#bdb8ae', '#d2c4a8', '#b3bcc0', '#c7baa3'].map(C);
const RUST = C('#a0583a');
const YELLOW = C('#e0b030');
const WHITE = C('#eef2f5');
const SOLAR = C('#2c3e66');
const METAL = C('#9aa0a6');

function lotBase(m: ModelBuilder, W: number, D: number, top: Color): void {
  // Foundation plinth: hides slopes under the lot; its top is the lot surface.
  m.box(-W / 2 + 0.2, W / 2 - 0.2, -5, 0.06, -D / 2 + 0.2, D / 2 - 0.2, STONE, top);
}

function litFn(r: () => number, p: number): (i: number) => number {
  return () => (r() < p ? 0.6 + r() * 0.4 : 0);
}

function house(m: ModelBuilder, def: ZonedDef, W: number, D: number, r: () => number): void {
  const rich = def.wealth >= 1;
  lotBase(m, W, D, def.wealth === 2 ? GRASS_RICH : GRASS);
  const wall = rich && r() < 0.5 ? pick(r, WALLS_R_RICH) : pick(r, WALLS_R);
  const roof = pick(r, ROOFS);
  const floors = def.level >= 2 ? 2 : 1;
  const fh = 3;
  const bw = Math.min(W - 2.6, 5.5 + def.level * 1.6 + def.wealth * 0.8 + r() * 1.2);
  const bd = Math.min(D - 6, 6 + def.level * 1.2 + r() * 1.5);
  const x0 = -bw / 2 + (W > 10 ? (r() - 0.5) * 2 : 0);
  const x1 = x0 + bw;
  const z0 = -D / 2 + 3.2 + r() * 1.2;
  const z1 = z0 + bd;
  const top = floors * fh;
  m.box(x0, x1, 0, top, z0, z1, wall);
  const lit = litFn(r, 0.55);
  m.windows('front', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 2.6 });
  m.windows('back', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 3 });
  m.windows('left', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 3.5 });
  m.windows('right', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 3.5 });
  // Door and a little porch roof.
  const dx = x0 + bw * (0.3 + r() * 0.4);
  m.quad(
    [dx - 0.5, 0, z0 - 0.05],
    [dx - 0.5, 2.1, z0 - 0.05],
    [dx + 0.5, 2.1, z0 - 0.05],
    [dx + 0.5, 0, z0 - 0.05],
    DOOR,
  );
  if (def.level >= 2 || rich) m.box(dx - 1.1, dx + 1.1, 2.4, 2.6, z0 - 1.3, z0, TRIM);
  // Path to the street.
  m.ground(dx - 0.6, dx + 0.6, -D / 2 + 0.2, z0, 0.08, PAVE);
  if (def.level === 3 || r() < 0.4) m.hip(x0, x1, z0, z1, top, 1.8 + r() * 0.6, roof);
  else m.gable(x0, x1, z0, z1, top, 1.8 + r() * 0.8, roof, wall, bw >= bd);
  if (r() < 0.5) m.box(x1 - 1.4, x1 - 0.6, top, top + 2.8, z0 + bd * 0.6, z0 + bd * 0.6 + 0.8, C('#9c6b52'));
  // Side wing or garage for bigger homes.
  if (def.level >= 2 && W - bw > 5) {
    const gx0 = x1 + 0.2;
    const gx1 = Math.min(W / 2 - 0.8, gx0 + 3.6);
    if (gx1 - gx0 > 2.5) {
      m.box(gx0, gx1, 0, 2.8, z0 + 0.5, z0 + 6, wall);
      m.quad(
        [gx0 + 0.3, 0, z0 + 0.45],
        [gx0 + 0.3, 2.3, z0 + 0.45],
        [gx1 - 0.3, 2.3, z0 + 0.45],
        [gx1 - 0.3, 0, z0 + 0.45],
        C('#e8e4dc'),
      );
      m.gable(gx0, gx1, z0 + 0.5, z0 + 6, 2.8, 1, roof, wall, false, 0.2);
      m.ground(gx0 + 0.2, gx1 - 0.2, -D / 2 + 0.2, z0 + 0.5, 0.08, PAVE);
    }
  }
  if (def.wealth >= 1) {
    // Hedges along the lot sides.
    m.box(-W / 2 + 0.3, -W / 2 + 0.9, 0, 1.1, -D / 2 + 1.5, D / 2 - 0.3, HEDGE);
    m.box(W / 2 - 0.9, W / 2 - 0.3, 0, 1.1, -D / 2 + 1.5, D / 2 - 0.3, HEDGE);
  }
  if (def.wealth === 2 && D - (z1 + D / 2) > 5)
    m.ground(-2.5, 2.5, z1 + 1.2, Math.min(D / 2 - 1, z1 + 5), 0.1, POOL);
}

function townhouses(m: ModelBuilder, _def: ZonedDef, W: number, D: number, r: () => number): void {
  lotBase(m, W, D, GRASS);
  const units = Math.max(2, Math.round(W / 5));
  const uw = (W - 1.2) / units;
  const floors = 3;
  const fh = 3;
  const z0 = -D / 2 + 2.5;
  const z1 = Math.min(D / 2 - 2, z0 + 10);
  const roofCol = pick(r, ROOFS);
  for (let u = 0; u < units; u++) {
    const x0 = -W / 2 + 0.6 + u * uw;
    const x1 = x0 + uw;
    const wall = pick(r, WALLS_R);
    const top = floors * fh + (r() < 0.3 ? fh : 0);
    m.box(x0, x1, 0, top, z0, z1, wall);
    const lit = litFn(r, 0.55);
    m.windows('front', x0, x1, z0, z1, 0, top / fh, fh, { col: GLASS, lit, spacing: 2.4 });
    m.windows('back', x0, x1, z0, z1, 0, top / fh, fh, { col: GLASS, lit, spacing: 2.4 });
    m.quad(
      [x0 + uw / 2 - 0.5, 0, z0 - 0.05],
      [x0 + uw / 2 - 0.5, 2.2, z0 - 0.05],
      [x0 + uw / 2 + 0.5, 2.2, z0 - 0.05],
      [x0 + uw / 2 + 0.5, 0, z0 - 0.05],
      DOOR,
    );
    m.gable(x0, x1, z0, z1, top, 2.2, r() < 0.3 ? pick(r, ROOFS) : roofCol, wall, false, 0.2);
  }
  m.windows('left', -W / 2 + 0.6, W / 2 - 0.6, z0, z1, 0, floors, fh, {
    col: GLASS,
    lit: litFn(r, 0.5),
    spacing: 3,
  });
  m.windows('right', -W / 2 + 0.6, W / 2 - 0.6, z0, z1, 0, floors, fh, {
    col: GLASS,
    lit: litFn(r, 0.5),
    spacing: 3,
  });
  m.ground(-W / 2 + 0.4, W / 2 - 0.4, -D / 2 + 0.3, z0, 0.08, PAVE);
}

function apartments(m: ModelBuilder, def: ZonedDef, W: number, D: number, r: () => number): void {
  lotBase(m, W, D, def.wealth ? GRASS_RICH : PAVE);
  const floors = def.floors + Math.floor(r() * 2);
  const fh = 3;
  const x0 = -W / 2 + 1.5;
  const x1 = W / 2 - 1.5;
  const z0 = -D / 2 + 2.5;
  const z1 = D / 2 - 2;
  const wall = pick(r, def.wealth ? WALLS_R_RICH : WALLS_R);
  const accent = pick(r, ROOFS);
  const top = floors * fh;
  m.box(x0, x1, 0, top, z0, z1, wall, C('#9a958c'));
  const lit = litFn(r, 0.6);
  m.windows('front', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 2.8 });
  m.windows('back', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 2.8 });
  m.windows('left', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 3 });
  m.windows('right', x0, x1, z0, z1, 0, floors, fh, { col: GLASS, lit, spacing: 3 });
  // Balcony slabs every other bay on the front.
  const bays = Math.floor((x1 - x0) / 5.6);
  for (let f = 1; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      if ((b + f) % 2) continue;
      const bx = x0 + (b + 0.5) * ((x1 - x0) / bays);
      m.box(bx - 1.3, bx + 1.3, f * fh - 0.15, f * fh + 0.15, z0 - 1.1, z0, accent);
    }
  }
  m.parapet(x0, x1, z0, z1, top, wall);
  m.box(x0 + 1, x0 + 3.5, top, top + 2.2, z0 + 2, z0 + 4.5, C('#b0aba2'));
  // Entrance canopy.
  m.box(-1.8, 1.8, 2.6, 2.9, z0 - 1.6, z0, accent);
  m.quad(
    [-0.8, 0, z0 - 0.05],
    [-0.8, 2.4, z0 - 0.05],
    [0.8, 2.4, z0 - 0.05],
    [0.8, 0, z0 - 0.05],
    GLASS_SHOP,
    0.5,
  );
}

function tower(
  m: ModelBuilder,
  def: ZonedDef,
  W: number,
  D: number,
  r: () => number,
  residential: boolean,
): void {
  lotBase(m, W, D, PAVE);
  const fh = residential ? 3 : 3.6;
  const floors = def.floors + Math.floor(r() * 5);
  const podiumH = fh * 2;
  const px0 = -W / 2 + 1;
  const px1 = W / 2 - 1;
  const pz0 = -D / 2 + 1.5;
  const pz1 = D / 2 - 1;
  const podium = residential ? pick(r, WALLS_R) : C('#d8d4cc');
  m.box(px0, px1, 0, podiumH, pz0, pz1, podium);
  m.windows('front', px0, px1, pz0, pz1, 0, 1, podiumH, {
    col: GLASS_SHOP,
    lit: () => 0.8,
    band: true,
    height: podiumH * 0.55,
  });
  const tw = (px1 - px0) * (0.62 + r() * 0.12);
  const td = (pz1 - pz0) * (0.62 + r() * 0.12);
  const tz0 = (pz0 + pz1) / 2 - td / 2;
  const glass = residential ? GLASS : pick(r, OFFICE_GLASS);
  const body = residential ? pick(r, def.wealth ? WALLS_R_RICH : WALLS_R) : pick(r, OFFICE_GLASS);
  const tiers = floors > 14 ? 2 : 1;
  let y = podiumH;
  let w = tw;
  let d = td;
  const perTier = Math.ceil((floors - 2) / tiers);
  for (let t = 0; t < tiers; t++) {
    const x0 = -w / 2;
    const z0 = tz0 + (td - d) / 2;
    const h = perTier * fh;
    m.box(x0, x0 + w, y, y + h, z0, z0 + d, body, C('#8f949a'));
    const lit = litFn(r, residential ? 0.55 : 0.75);
    for (const face of ['front', 'back', 'left', 'right'] as const) {
      m.windows(face, x0, x0 + w, z0, z0 + d, y, perTier, fh, {
        col: glass,
        lit,
        band: !residential,
        spacing: residential ? 3 : 4,
        height: residential ? fh * 0.5 : fh * 0.62,
      });
    }
    y += h;
    w *= 0.78;
    d *= 0.78;
  }
  // Rooftop.
  m.box(-w / 3, w / 3, y, y + 2.5, tz0 + td / 2 - d / 3, tz0 + td / 2 + d / 3, METAL);
  if (!residential || r() < 0.4)
    m.box(-0.2, 0.2, y + 2.5, y + 2.5 + 6 + r() * 6, tz0 + td / 2 - 0.2, tz0 + td / 2 + 0.2, METAL);
}

function shop(m: ModelBuilder, def: ZonedDef, W: number, D: number, r: () => number): void {
  lotBase(m, W, D, PAVE);
  const floors = def.level >= 3 ? 2 : 1;
  const fh = 3.8;
  const x0 = -W / 2 + 0.8;
  const x1 = W / 2 - 0.8;
  const z0 = -D / 2 + 2.2;
  const z1 = Math.min(D / 2 - 0.8, z0 + Math.max(6, D - 4));
  const wall = pick(r, WALLS_C);
  const top = floors * fh;
  m.box(x0, x1, 0, top, z0, z1, wall);
  // Shop window across the front, lit in the evening.
  m.quad(
    [x0 + 0.6, 0.4, z0 - 0.05],
    [x0 + 0.6, 2.8, z0 - 0.05],
    [x1 - 0.6, 2.8, z0 - 0.05],
    [x1 - 0.6, 0.4, z0 - 0.05],
    GLASS_SHOP,
    0.9,
  );
  if (floors > 1) m.windows('front', x0, x1, z0, z1, fh, floors - 1, fh, { col: GLASS, lit: litFn(r, 0.5) });
  const awning = pick(r, AWNINGS);
  m.quad(
    [x0 + 0.3, 3.2, z0 - 1.8],
    [x0 + 0.3, 3.6, z0],
    [x1 - 0.3, 3.6, z0],
    [x1 - 0.3, 3.2, z0 - 1.8],
    awning,
  );
  const sign = pick(r, SIGNS);
  m.box(
    (x0 + x1) / 2 - Math.min(2.5, (x1 - x0) / 3),
    (x0 + x1) / 2 + Math.min(2.5, (x1 - x0) / 3),
    top - 0.2,
    top + 1.1,
    z0 - 0.3,
    z0 - 0.05,
    sign,
  );
  m.parapet(x0, x1, z0, z1, top, wall, 0.5);
  if (r() < 0.6) m.box(x0 + 1, x0 + 2.4, top, top + 1, z1 - 3, z1 - 1.6, METAL);
}

function midCommercial(m: ModelBuilder, def: ZonedDef, W: number, D: number, r: () => number): void {
  lotBase(m, W, D, PAVE);
  const floors = def.floors + Math.floor(r() * 2);
  const fh = 3.4;
  const x0 = -W / 2 + 0.8;
  const x1 = W / 2 - 0.8;
  const z0 = -D / 2 + 2;
  const z1 = D / 2 - 1.2;
  const wall = pick(r, WALLS_C);
  const top = floors * fh;
  m.box(x0, x1, 0, top, z0, z1, wall, C('#9a958c'));
  m.quad(
    [x0 + 0.4, 0.3, z0 - 0.05],
    [x0 + 0.4, 3, z0 - 0.05],
    [x1 - 0.4, 3, z0 - 0.05],
    [x1 - 0.4, 0.3, z0 - 0.05],
    GLASS_SHOP,
    0.9,
  );
  const lit = litFn(r, 0.6);
  for (const face of ['front', 'back', 'left', 'right'] as const) {
    m.windows(face, x0, x1, z0, z1, fh, floors - 1, fh, {
      col: pick(r, OFFICE_GLASS),
      lit,
      band: r() < 0.5,
      spacing: 3,
    });
  }
  const units = Math.max(1, Math.round((x1 - x0) / 7));
  for (let u = 0; u < units; u++) {
    const ax0 = x0 + (u * (x1 - x0)) / units + 0.3;
    const ax1 = x0 + ((u + 1) * (x1 - x0)) / units - 0.3;
    m.quad([ax0, 3.1, z0 - 1.6], [ax0, 3.5, z0], [ax1, 3.5, z0], [ax1, 3.1, z0 - 1.6], pick(r, AWNINGS));
  }
  m.parapet(x0, x1, z0, z1, top, wall);
  for (let k = 0; k < 2; k++)
    m.box(x0 + 1.5 + k * 3, x0 + 3.5 + k * 3, top, top + 1.2, z0 + 2, z0 + 3.5, METAL);
  if (r() < 0.5) m.box(-2.5, 2.5, top - 0.5, top + 1.3, z0 - 0.4, z0 - 0.1, pick(r, SIGNS));
}

function industry(m: ModelBuilder, def: ZonedDef, W: number, D: number, r: () => number): void {
  const tier = def.wealth;
  lotBase(m, W, D, tier === 2 ? GRASS_RICH : CONCRETE);
  const x0 = -W / 2 + 1;
  const x1 = W / 2 - 1;
  const z0 = -D / 2 + 3;
  const z1 = D / 2 - 1.2;
  if (tier === 2) {
    // High-tech campus: white blocks, glass bands, solar roofs.
    const floors = 2 + def.level;
    const fh = 3.6;
    const wall = WHITE;
    const glass = pick(r, OFFICE_GLASS);
    const midZ = z0 + (z1 - z0) * 0.55;
    m.box(x0, x1, 0, floors * fh, z0, midZ, wall);
    for (const face of ['front', 'left', 'right'] as const)
      m.windows(face, x0, x1, z0, midZ, 0, floors, fh, { col: glass, lit: litFn(r, 0.7), band: true });
    m.box(x0 + 2, x1 - 2, 0, (floors - 1) * fh, midZ, z1, C('#e3e8ec'));
    for (let k = 0; k < 3; k++)
      m.quad(
        [x0 + 1 + k * ((x1 - x0 - 2) / 3), floors * fh + 0.3, z0 + 1],
        [x0 + 1 + k * ((x1 - x0 - 2) / 3), floors * fh + 0.9, midZ - 1],
        [x0 + (k + 1) * ((x1 - x0 - 2) / 3), floors * fh + 0.9, midZ - 1],
        [x0 + (k + 1) * ((x1 - x0 - 2) / 3), floors * fh + 0.3, z0 + 1],
        SOLAR,
      );
    m.parapet(x0, x1, z0, midZ, floors * fh, wall, 0.4);
    return;
  }
  const wall = pick(r, WALLS_I);
  const h = 6 + def.level * 1.5 + tier * 1.5;
  const hallZ1 = z1 - (W > 20 ? 6 : 3);
  m.box(x0, x1, 0, h, z0, hallZ1, wall, C('#8a8d91'));
  // Loading doors on the front.
  const doors = Math.max(1, Math.floor((x1 - x0) / 7));
  for (let k = 0; k < doors; k++) {
    const cx = x0 + (k + 0.5) * ((x1 - x0) / doors);
    m.quad(
      [cx - 1.6, 0, z0 - 0.05],
      [cx - 1.6, 4, z0 - 0.05],
      [cx + 1.6, 4, z0 - 0.05],
      [cx + 1.6, 0, z0 - 0.05],
      C('#6f7479'),
    );
    m.box(cx - 2, cx + 2, 4.2, 4.5, z0 - 1.2, z0, YELLOW);
  }
  m.windows('left', x0, x1, z0, hallZ1, 0, 1, h, { col: GLASS, lit: litFn(r, 0.4), band: true, height: 1.2 });
  m.windows('right', x0, x1, z0, hallZ1, 0, 1, h, {
    col: GLASS,
    lit: litFn(r, 0.4),
    band: true,
    height: 1.2,
  });
  if (tier === 0) {
    // Saw-tooth roof and a smokestack.
    const teeth = Math.max(2, Math.floor((hallZ1 - z0) / 4));
    const step = (hallZ1 - z0) / teeth;
    for (let k = 0; k < teeth; k++) {
      const za = z0 + k * step;
      const zb = za + step;
      m.quad([x0, h, za], [x0, h + 2.2, za], [x1, h + 2.2, za], [x1, h, za], GLASS, 0.3);
      m.quad([x1, h, zb], [x1, h + 2.2, za], [x0, h + 2.2, za], [x0, h, zb], C('#7b7f84'));
    }
    if (def.level >= 2 || r() < 0.35) {
      const sx = x1 - 2.5;
      const sz = Math.min(hallZ1 + 2.5, D / 2 - 2);
      const stackH = h + 5 + def.level * 2.5;
      m.cylinder(sx, sz, 0.9, 0, stackH, RUST, 8);
      m.cylinder(sx, sz, 0.95, stackH - 1.8, stackH - 0.9, WHITE, 8);
    }
    if (W > 18) {
      m.cylinder(x0 + 3.5, Math.min(hallZ1 + 3, D / 2 - 3), 2.4, 0, 6, C('#c9c6bf'), 10, C('#a8a5a0'));
    }
  } else {
    // Manufacturing: flat roof with vents and a front office.
    m.parapet(x0, x1, z0, hallZ1, h, wall, 0.4);
    for (let k = 0; k < 3; k++)
      m.cylinder(x0 + 3 + k * ((x1 - x0 - 6) / 2), (z0 + hallZ1) / 2, 0.7, h, h + 1.6, METAL, 6);
    m.box(x0, Math.min(x1, x0 + 9), 0, 7, z0 - 0.1, z0 + 5, C('#d9d6cf'));
    m.windows('front', x0, Math.min(x1, x0 + 9), z0 - 0.1, z0 + 5, 0, 2, 3.5, {
      col: GLASS,
      lit: litFn(r, 0.6),
      band: true,
    });
  }
  // Parked trucks area.
  if (hallZ1 < z1 - 2) m.ground(x0, x1, hallZ1 + 0.3, z1, 0.08, ASPHALT_LOT);
}

/** Build the procedural model for a zoned building on a w×d-cell lot. */
export function buildZonedModel(def: ZonedDef, w: number, d: number, variant: number): ModelData {
  const W = w * CELL;
  const D = d * CELL;
  const r = modelRng(variant * 7919 + w * 31 + d * 17 + def.level * 3);
  const m = new ModelBuilder();
  if (def.zone === ZONE_R) {
    if (def.density === 0) house(m, def, W, D, r);
    else if (def.density === 1)
      (def.level === 1 && W >= 12 && r() < 0.8 ? townhouses : apartments)(m, def, W, D, r);
    else tower(m, def, W, D, r, true);
  } else if (def.zone === ZONE_C) {
    if (def.density === 0) shop(m, def, W, D, r);
    else if (def.density === 1) midCommercial(m, def, W, D, r);
    else tower(m, def, W, D, r, false);
  } else if (def.zone === ZONE_I) {
    industry(m, def, W, D, r);
  }
  return m.build();
}
