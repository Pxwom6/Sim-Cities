import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';
import type { ClientWorld } from '../client/world';
import { CELL } from '../data/zones';
import type { VehicleRenderer } from './vehicles';

const FLAMES_PER = 28;
const SMOKE_PER = 22;
const MAX_FIRES = 64;
const MAX_SIRENS = 128;

const VERT = /* glsl */ `
  attribute vec4 aSeed;   // phase, speed, dx, dz
  attribute float aSize;
  uniform float uTime;
  uniform float uRise;
  uniform float uDrift;
  uniform float uPixel;
  varying float vLife;
  varying float vSeed;
  void main() {
    float life = fract(aSeed.x + uTime * aSeed.y);
    vLife = life;
    vSeed = aSeed.x;
    vec3 p = position;
    float spread = 1.0 - 0.6 * life;
    p.x += aSeed.z * spread + uDrift * life * life + sin(uTime * 3.0 + aSeed.x * 20.0) * 0.4 * life;
    p.z += aSeed.w * spread + uDrift * 0.4 * life * life;
    p.y += life * uRise * (0.6 + aSeed.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float grow = mix(1.0, 2.6, life) * (uDrift > 0.0 ? 1.0 : (1.0 - life * 0.7));
    gl_PointSize = aSize * grow * uPixel / max(1.0, -mv.z);
  }
`;

const FLAME_FRAG = /* glsl */ `
  varying float vLife;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.1, d) * (1.0 - vLife);
    vec3 hot = vec3(1.0, 0.92, 0.55);
    vec3 warm = vec3(1.0, 0.45, 0.08);
    vec3 col = mix(hot, warm, smoothstep(0.0, 0.6, vLife + d));
    gl_FragColor = vec4(col * a * 1.4, a);
  }
`;

const SMOKE_FRAG = /* glsl */ `
  varying float vLife;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * 0.55;
    vec3 col = mix(vec3(0.16, 0.15, 0.14), vec3(0.52, 0.5, 0.48), vLife) * (0.9 + 0.2 * vSeed);
    gl_FragColor = vec4(col, a);
  }
`;

const SIREN_VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixel;
  varying float vOn;
  varying float vBlue;
  void main() {
    float t = fract(uTime * 2.2 + aPhase);
    vBlue = step(0.5, t);
    vOn = 0.35 + 0.65 * abs(sin(t * 6.2832 * 2.0));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 1.4 * uPixel / max(1.0, -mv.z) + 3.0;
  }
`;
const SIREN_FRAG = /* glsl */ `
  varying float vOn;
  varying float vBlue;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    vec3 col = mix(vec3(1.0, 0.18, 0.12), vec3(0.2, 0.45, 1.0), vBlue);
    float a = smoothstep(0.5, 0.0, d) * vOn;
    gl_FragColor = vec4(col * a * 1.6, a);
  }
`;

function makePoints(max: number, frag: string, additive: boolean, rise: number, drift: number) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
  g.setAttribute('aSeed', new BufferAttribute(new Float32Array(max * 4), 4));
  g.setAttribute('aSize', new BufferAttribute(new Float32Array(max), 1));
  g.setDrawRange(0, 0);
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uRise: { value: rise },
      uDrift: { value: drift },
      uPixel: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * Transient effects: flames and smoke over burning buildings, flashing lights on emergency
 * vehicles heading to a call. All particle motion runs in the vertex shader.
 */
export class EffectsRenderer {
  readonly group = new Group();
  private flames = makePoints(MAX_FIRES * FLAMES_PER, FLAME_FRAG, true, 9, 0);
  private smoke = makePoints(MAX_FIRES * SMOKE_PER, SMOKE_FRAG, false, 34, 10);
  private sirens: Points;
  private key = '';
  fires = 0;

  constructor(
    private world: ClientWorld,
    private vehicles: VehicleRenderer,
    private heights: Map<number, number>,
  ) {
    this.smoke.renderOrder = 6;
    this.flames.renderOrder = 7;
    this.group.add(this.smoke, this.flames);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(MAX_SIRENS * 3), 3));
    g.setAttribute('aPhase', new BufferAttribute(new Float32Array(MAX_SIRENS), 1));
    g.setDrawRange(0, 0);
    this.sirens = new Points(
      g,
      new ShaderMaterial({
        vertexShader: SIREN_VERT,
        fragmentShader: SIREN_FRAG,
        uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.sirens.frustumCulled = false;
    this.sirens.renderOrder = 8;
    this.group.add(this.sirens);
  }

  private rebuildFires(): void {
    const burning = [...this.world.buildings.values()]
      .filter((b) => b.fire > 0 && b.state !== 3)
      .sort((a, b) => a.id - b.id)
      .slice(0, MAX_FIRES);
    const key = burning.map((b) => `${b.id}:${b.fire}:${this.heights.get(b.id) ?? 0}`).join(',');
    if (key === this.key) return;
    this.key = key;
    this.fires = burning.length;
    for (const [pts, per, big] of [
      [this.flames, FLAMES_PER, 2.2],
      [this.smoke, SMOKE_PER, 4.2],
    ] as const) {
      const pos = pts.geometry.getAttribute('position') as BufferAttribute;
      const seed = pts.geometry.getAttribute('aSeed') as BufferAttribute;
      const size = pts.geometry.getAttribute('aSize') as BufferAttribute;
      let n = 0;
      for (const b of burning) {
        const h = this.heights.get(b.id) ?? 6;
        const hw = (b.w * CELL) / 2 - 1;
        const hd = (b.d * CELL) / 2 - 1;
        const c = Math.cos(b.angle);
        const s = Math.sin(b.angle);
        const count = Math.max(8, Math.round(per * Math.min(1, 0.45 + b.fire)));
        let r = b.id * 9301 + 49297;
        const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
        for (let k = 0; k < count; k++) {
          const u = (rnd() - 0.5) * 2 * hw * 0.8;
          const w = (rnd() - 0.5) * 2 * hd * 0.8;
          pos.setXYZ(n, b.x + u * c - w * s, b.y + h * (0.55 + rnd() * 0.4), b.z + u * s + w * c);
          seed.setXYZW(n, rnd(), 0.35 + rnd() * 0.5, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2);
          size.setX(n, big * (1.2 + rnd() * 1.4) * (0.7 + b.fire * 0.5));
          n++;
        }
      }
      pos.needsUpdate = seed.needsUpdate = size.needsUpdate = true;
      pts.geometry.setDrawRange(0, n);
    }
  }

  private updateSirens(): void {
    const pos = this.sirens.geometry.getAttribute('position') as BufferAttribute;
    const ph = this.sirens.geometry.getAttribute('aPhase') as BufferAttribute;
    let n = 0;
    for (const [id, v] of this.vehicles.positions) {
      if (n >= MAX_SIRENS) break;
      if (v.phase !== 'out' || (v.kind !== 'fire' && v.kind !== 'police' && v.kind !== 'ambulance')) continue;
      const top = v.kind === 'police' ? 2.0 : 3.4;
      pos.setXYZ(n, v.x, v.y + top, v.z);
      ph.setX(n, (id % 7) / 7);
      n++;
    }
    pos.needsUpdate = ph.needsUpdate = true;
    this.sirens.geometry.setDrawRange(0, n);
  }

  /** `pxPerMetre` = drawing-buffer height / (2·tan(fov/2)): a 1 m sprite at 1 m distance, in pixels. */
  update(time: number, pxPerMetre: number): void {
    this.rebuildFires();
    this.updateSirens();
    for (const p of [this.flames, this.smoke, this.sirens]) {
      const u = (p.material as ShaderMaterial).uniforms;
      u.uTime!.value = time;
      u.uPixel!.value = pxPerMetre;
    }
  }
}
