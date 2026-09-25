import { Color } from 'three';
import type { CivicDef } from '../../data/civic';
import { ModelBuilder, modelRng, type ModelData } from './builder';

const C = (hex: string) => new Color(hex);
const CONCRETE = C('#c9c6bf');
const CONCRETE_DARK = C('#a9a6a0');
const GRAVEL = C('#bdb6a6');
const GRASS = C('#8cc063');
const STONE = C('#bdb5a6');
const WHITE = C('#f2f4f5');
const RED = C('#c9423a');
const STEEL = C('#9aa0a6');
const GLASS = C('#3d5a73');
const BRICK = C('#b5654a');
const WATER = C('#4aa3c8');
const SOLAR = C('#2c3e66');
const SOLAR_FRAME = C('#c8ccd0');
const COAL = C('#35363a');
const DIRT = C('#8b7355');
const MOUND = C('#7d8f4e');
const GREEN_ROOF = C('#5a9a5a');
const YELLOW = C('#e0b030');

function base(m: ModelBuilder, W: number, D: number, top: Color): void {
  m.box(-W / 2 + 0.2, W / 2 - 0.2, -5, 0.06, -D / 2 + 0.2, D / 2 - 0.2, STONE, top);
}

function fence(m: ModelBuilder, W: number, D: number, col = STEEL): void {
  const h = 1.8;
  const t = 0.12;
  m.box(-W / 2 + 0.4, W / 2 - 0.4, 0, h, -D / 2 + 0.4, -D / 2 + 0.4 + t, col);
  m.box(-W / 2 + 0.4, W / 2 - 0.4, 0, h, D / 2 - 0.4 - t, D / 2 - 0.4, col);
  m.box(-W / 2 + 0.4, -W / 2 + 0.4 + t, 0, h, -D / 2 + 0.4, D / 2 - 0.4, col);
  m.box(W / 2 - 0.4 - t, W / 2 - 0.4, 0, h, -D / 2 + 0.4, D / 2 - 0.4, col);
}

function lit(r: () => number, p = 0.6): (i: number) => number {
  return () => (r() < p ? 0.7 + r() * 0.3 : 0);
}

function turbine(m: ModelBuilder, x: number, z: number, h: number, r: () => number): void {
  m.frustum(x, z, 1.1, 0.6, 0, h, WHITE, 10);
  m.box(x - 0.9, x + 0.9, h - 0.8, h + 1, z - 2.4, z + 1.2, WHITE);
  const hubZ = z - 2.6;
  const blade = 11;
  const phase = r() * Math.PI * 2;
  for (let k = 0; k < 3; k++) {
    const a = phase + (k * Math.PI * 2) / 3;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy * 0.5;
    const py = dx * 0.5;
    m.quad(
      [x + px, h + py, hubZ],
      [x + dx * blade + px * 0.4, h + dy * blade + py * 0.4, hubZ],
      [x + dx * blade - px * 0.4, h + dy * blade - py * 0.4, hubZ],
      [x - px, h - py, hubZ],
      WHITE,
    );
    m.quad(
      [x - px, h - py, hubZ + 0.02],
      [x + dx * blade - px * 0.4, h + dy * blade - py * 0.4, hubZ + 0.02],
      [x + dx * blade + px * 0.4, h + dy * blade + py * 0.4, hubZ + 0.02],
      [x + px, h + py, hubZ + 0.02],
      WHITE,
    );
  }
}

function stack(m: ModelBuilder, x: number, z: number, r: number, h: number): void {
  m.frustum(x, z, r * 1.15, r, 0, h, CONCRETE, 12);
  m.frustum(x, z, r * 1.02, r * 1.02, h - 6, h - 3, RED, 12, false);
  m.frustum(x, z, r * 1.02, r * 1.02, h - 12, h - 9, RED, 12, false);
}

export function buildCivicModel(def: CivicDef, variant: number, fill = 0): ModelData {
  const W = def.w;
  const D = def.d;
  const r = modelRng(variant * 131 + W * 7 + D);
  const m = new ModelBuilder();
  switch (def.model) {
    case 'wind': {
      base(m, W, D, GRASS);
      turbine(m, -W / 4, D / 6, 22 + r() * 4, r);
      turbine(m, W / 4, -D / 6, 22 + r() * 4, r);
      m.box(-2, 2, 0, 2.4, D / 2 - 5, D / 2 - 2, CONCRETE_DARK);
      break;
    }
    case 'coal': {
      base(m, W, D, GRAVEL);
      const hall = { x0: -W / 2 + 3, x1: W / 2 - 12, z0: -D / 2 + 5, z1: D / 2 - 16 };
      m.box(hall.x0, hall.x1, 0, 20, hall.z0, hall.z1, CONCRETE, CONCRETE_DARK);
      m.windows('front', hall.x0, hall.x1, hall.z0, hall.z1, 0, 4, 5, {
        col: GLASS,
        lit: lit(r, 0.5),
        band: true,
        height: 1.4,
      });
      m.box(hall.x0 + 3, hall.x0 + 13, 20, 27, hall.z0 + 4, hall.z1 - 4, CONCRETE_DARK);
      stack(m, W / 2 - 6, -D / 2 + 10, 2.4, 58);
      stack(m, W / 2 - 6, -D / 2 + 20, 2.4, 52);
      // Coal pile and a conveyor.
      m.frustum(-W / 4, D / 2 - 8, 8, 1, 0, 6, COAL, 8);
      m.box(-W / 4, hall.x0 + 12, 7, 8, D / 2 - 9, D / 2 - 8, STEEL);
      fence(m, W, D);
      break;
    }
    case 'gas': {
      base(m, W, D, GRAVEL);
      m.box(-W / 2 + 3, W / 2 - 3, 0, 14, -D / 2 + 4, 0, WHITE, CONCRETE_DARK);
      m.windows('front', -W / 2 + 3, W / 2 - 3, -D / 2 + 4, 0, 0, 3, 4.5, {
        col: GLASS,
        lit: lit(r, 0.5),
        band: true,
        height: 1.2,
      });
      m.frustum(-W / 4, -D / 4, 1.6, 1.4, 14, 30, STEEL, 10);
      m.frustum(W / 4, -D / 4, 1.6, 1.4, 14, 30, STEEL, 10);
      m.cylinder(-W / 4, D / 4 + 2, 6, 0, 9, WHITE, 14, C('#dfe3e6'));
      m.cylinder(W / 4, D / 4 + 2, 6, 0, 9, WHITE, 14, C('#dfe3e6'));
      fence(m, W, D);
      break;
    }
    case 'solar': {
      base(m, W, D, GRASS);
      for (let row = 0; row < 5; row++) {
        const z = -D / 2 + 5 + row * ((D - 8) / 5);
        for (const [x0, x1] of [
          [-W / 2 + 2, -1],
          [1, W / 2 - 2],
        ]) {
          m.quad([x0!, 0.8, z + 4], [x0!, 2.6, z], [x1!, 2.6, z], [x1!, 0.8, z + 4], SOLAR);
          m.box(x0!, x1!, 0, 0.8, z + 1.8, z + 2.1, SOLAR_FRAME);
        }
      }
      m.box(-2.5, 2.5, 0, 3, -D / 2 + 1, -D / 2 + 4, WHITE);
      fence(m, W, D);
      break;
    }
    case 'nuclear': {
      base(m, W, D, CONCRETE);
      m.frustum(-W / 4, D / 5, 13, 8, 0, 18, CONCRETE, 16, false);
      m.frustum(-W / 4, D / 5, 8, 10, 18, 42, CONCRETE, 16, false);
      m.frustum(W / 4 - 2, D / 5, 13, 8, 0, 18, CONCRETE, 16, false);
      m.frustum(W / 4 - 2, D / 5, 8, 10, 18, 42, CONCRETE, 16, false);
      m.cylinder(0, -D / 4, 9, 0, 16, WHITE, 16);
      m.dome(0, -D / 4, 9, 16, WHITE);
      m.box(-W / 2 + 3, -W / 2 + 18, 0, 10, -D / 2 + 3, -D / 2 + 14, C('#e7e2da'));
      m.windows('front', -W / 2 + 3, -W / 2 + 18, -D / 2 + 3, -D / 2 + 14, 0, 2, 4.5, {
        col: GLASS,
        lit: lit(r),
        band: true,
      });
      fence(m, W, D);
      break;
    }
    case 'pump': {
      base(m, W, D, GRAVEL);
      m.box(-4, 4, 0, 4.5, -D / 2 + 2, -D / 2 + 8, BRICK);
      m.gable(-4, 4, -D / 2 + 2, -D / 2 + 8, 4.5, 1.6, C('#5b6470'), BRICK, true, 0.3);
      m.cylinder(2, D / 4, 3.2, 0, 7, C('#6fa6c8'), 12, C('#5b8fb0'));
      m.box(-3, 0, 0.4, 1.2, -D / 2 + 8, D / 4, STEEL);
      fence(m, W, D);
      break;
    }
    case 'riverpump': {
      base(m, W, D, GRAVEL);
      m.box(-6, 6, 0, 6, -D / 2 + 2, -D / 2 + 10, CONCRETE);
      m.windows('front', -6, 6, -D / 2 + 2, -D / 2 + 10, 0, 1, 6, {
        col: GLASS,
        lit: lit(r),
        band: true,
        height: 1.2,
      });
      for (const x of [-3, 3]) m.box(x - 0.8, x + 0.8, 0.6, 2.2, -D / 2 + 10, D / 2 - 0.5, C('#4f7fa3'));
      m.box(-7, 7, 0, 1.2, D / 2 - 3, D / 2 - 0.3, CONCRETE_DARK);
      break;
    }
    case 'outflow': {
      base(m, W, D, GRAVEL);
      m.box(-3, 3, 0, 3, -D / 2 + 2, -D / 2 + 6, CONCRETE);
      m.cylinder(0, 0, 1.4, 0, 1.6, C('#6b6f73'), 10);
      m.box(-1.2, 1.2, 0.3, 2.1, -D / 2 + 6, D / 2 - 0.3, C('#6b6f73'));
      m.ground(-2, 2, D / 2 - 4, D / 2 - 0.3, 0.1, C('#7a6a4a'));
      break;
    }
    case 'treatment': {
      base(m, W, D, GRASS);
      for (const [x, z] of [
        [-W / 4, D / 5],
        [W / 4, D / 5],
        [-W / 4, -D / 5 + 2],
      ] as const) {
        m.cylinder(x, z, 6, 0, 2.2, CONCRETE, 16, WATER);
        m.box(x - 0.2, x + 0.2, 2.2, 3, z - 6, z + 6, STEEL);
      }
      m.box(W / 8, W / 2 - 2, 0, 6, -D / 2 + 2, -D / 2 + 10, C('#e7e2da'));
      m.windows('front', W / 8, W / 2 - 2, -D / 2 + 2, -D / 2 + 10, 0, 2, 3, {
        col: GLASS,
        lit: lit(r),
        band: true,
      });
      fence(m, W, D);
      break;
    }
    case 'landfill': {
      base(m, W, D, DIRT);
      const h = 1 + fill * 12;
      m.frustum(0, 4, W * 0.38, W * 0.2, 0, h, MOUND, 10);
      m.box(-W / 2 + 2, -W / 2 + 10, 0, 3.5, -D / 2 + 2, -D / 2 + 8, C('#e7e2da'));
      m.windows('front', -W / 2 + 2, -W / 2 + 10, -D / 2 + 2, -D / 2 + 8, 0, 1, 3.5, {
        col: GLASS,
        lit: lit(r),
      });
      m.box(W / 2 - 10, W / 2 - 4, 0, 2.6, -D / 2 + 3, -D / 2 + 6, YELLOW);
      fence(m, W, D, C('#8a8d91'));
      break;
    }
    case 'recycling': {
      base(m, W, D, CONCRETE);
      m.box(-W / 2 + 2, W / 2 - 2, 0, 9, -D / 2 + 4, D / 2 - 8, C('#dfe7df'), GREEN_ROOF);
      m.windows('front', -W / 2 + 2, W / 2 - 2, -D / 2 + 4, D / 2 - 8, 0, 2, 4.5, {
        col: GLASS,
        lit: lit(r),
        band: true,
        height: 1.1,
      });
      for (let k = 0; k < 4; k++)
        m.box(
          -W / 2 + 3 + k * 6,
          -W / 2 + 7 + k * 6,
          0,
          2,
          D / 2 - 6,
          D / 2 - 2,
          [C('#3a8f5a'), C('#2f6fb0'), C('#e0b030'), C('#9a9a9a')][k]!,
        );
      break;
    }
    case 'incinerator': {
      base(m, W, D, GRAVEL);
      m.box(-W / 2 + 3, W / 2 - 3, 0, 16, -D / 2 + 4, D / 2 - 10, C('#b9b3aa'), CONCRETE_DARK);
      m.windows('front', -W / 2 + 3, W / 2 - 3, -D / 2 + 4, D / 2 - 10, 0, 3, 5, {
        col: GLASS,
        lit: lit(r, 0.7),
        band: true,
        height: 1.3,
      });
      stack(m, W / 2 - 6, D / 2 - 5, 1.8, 40);
      fence(m, W, D);
      break;
    }
    default:
      base(m, W, D, CONCRETE);
      m.box(-W / 2 + 2, W / 2 - 2, 0, 8, -D / 2 + 2, D / 2 - 2, WHITE);
  }
  return m.build();
}
