import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';
import type { ClientWorld } from '../client/world';
import { hourOfDay } from '../sim/time';
import { CameraController } from './camera';
import { Lighting } from './lighting';
import { TerrainRenderer } from './terrain';
import { TreeRenderer } from './trees';
import { WaterRenderer } from './water';

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  trees: number;
}

/** Owns the Three.js scene. Reads ClientWorld; never mutates the simulation. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 1, 14000);
  readonly controller: CameraController;
  readonly lighting: Lighting;
  readonly terrain: TerrainRenderer;
  readonly water: WaterRenderer;
  readonly trees: TreeRenderer;
  private time = 0;
  lastStats: RenderStats = { calls: 0, triangles: 0, geometries: 0, textures: 0, trees: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly world: ClientWorld,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    this.lighting = new Lighting(this.scene);
    this.terrain = new TerrainRenderer(world);
    this.scene.add(this.terrain.group);
    this.water = new WaterRenderer();
    this.scene.add(this.water.mesh);
    this.trees = new TreeRenderer(world);
    this.scene.add(this.trees.group);

    this.controller = new CameraController(this.camera, canvas, (x, z) => world.heightAt(x, z));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.lighting.sun.castShadow = on;
  }

  frame(dt: number): void {
    this.time += dt;
    this.controller.update(dt);
    const hour = hourOfDay(this.world.displayTick);
    const l = this.lighting;
    l.update(hour);
    l.follow(
      this.camera.position,
      this.controller.target,
      this.controller.current.distance * 0.9,
      this.camera.far,
    );
    l.fog.near = Math.max(900, this.controller.current.distance * 1.1);
    l.fog.far = Math.max(7500, this.controller.current.distance * 3.5);
    this.renderer.toneMappingExposure = 1.0 + l.night * 0.35;
    this.terrain.update(this.time);
    this.trees.updateLod(this.camera.position.x, this.camera.position.z);
    this.water.update(this.time);
    const wu = this.water.material.uniforms;
    wu.uSky!.value.copy(l.horizon);
    wu.uSunDir!.value.copy(l.sunDir);
    wu.uSunColor!.value.copy(l.sunColor);
    wu.uLight!.value = l.light;

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info;
    this.lastStats = {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      trees: this.trees.instanceCount,
    };
  }
}
