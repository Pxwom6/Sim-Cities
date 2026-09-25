import { Vector3 } from 'three';
import type { Game } from '../game';
import type { Command, CommandResult } from '../sim/commands';
import type { CameraPose, CameraPresetName } from '../render/camera';
import type { RenderStats } from '../render/renderer';
import type { CityStats } from '../sim/protocol';

export interface TestApi {
  ready: boolean;
  dispatch(cmd: Command): Promise<CommandResult>;
  getState(): Promise<
    CityStats & {
      renderStats: RenderStats;
      tick: number;
      highwayZ: number;
      segments: number;
      nodes: number;
      zoned: { R: number; C: number; I: number };
    }
  >;
  /** Render-side building list (id, position, state). */
  getBuildings(): { id: number; x: number; z: number; state: number; zone: number }[];
  /** Client (CSS pixel) coordinates of a world point on the ground. */
  worldToScreen(x: number, z: number): { x: number; y: number };
  advance(ticks: number): Promise<number>;
  setCamera(preset: CameraPresetName | Partial<CameraPose>): void;
  getCamera(): CameraPose;
  hash(): Promise<string>;
  setSpeed(speed: 0 | 1 | 2 | 3): void;
  /** Resolves after n rendered frames (lets screenshots settle). */
  waitFrames(n: number): Promise<void>;
  errors: string[];
}

declare global {
  interface Window {
    __game?: TestApi;
  }
}

export function installTestApi(game: Game): TestApi {
  const api: TestApi = {
    ready: true,
    dispatch: (cmd) => game.dispatch(cmd),
    getState: async () => {
      const stats = await game.client.query<CityStats>({ type: 'summary' });
      const w = game.world;
      return {
        ...stats,
        renderStats: game.renderer.lastStats,
        highwayZ: w.netState.nodes.get(w.highway.connect)!.z,
        segments: w.netState.segments.size,
        nodes: w.netState.nodes.size,
        zoned: countZones(game),
      };
    },
    advance: async (ticks) => {
      const t = await game.client.advance(ticks);
      game.world.displayTick = t;
      return t;
    },
    setCamera: (preset) => game.setCamera(preset, true),
    getCamera: () => ({ ...game.renderer.controller.goal }),
    getBuildings: () =>
      [...game.world.buildings.values()].map((b) => ({
        id: b.id,
        x: b.x,
        z: b.z,
        state: b.state,
        zone: b.zone,
      })),
    worldToScreen: (x, z) => {
      const v = new Vector3(x, Math.max(0, game.world.heightAt(x, z)), z).project(game.renderer.camera);
      const rect = game.renderer.canvas.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    },
    hash: () => game.client.query<string>({ type: 'hash' }),
    setSpeed: (s) => game.setSpeed(s),
    waitFrames: (n) =>
      new Promise((resolve) => {
        game.renderer.buildings.flushAll();
        let k = 0;
        const step = () => (++k >= n ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    errors: [],
  };
  window.__game = api;
  return api;
}

function countZones(game: Game): { R: number; C: number; I: number } {
  const out = { R: 0, C: 0, I: 0 };
  for (const b of game.world.netState.blocks.values()) {
    for (let i = 0; i < b.zone.length; i++) {
      if (!b.valid[i]) continue;
      if (b.zone[i] === 1) out.R++;
      else if (b.zone[i] === 2) out.C++;
      else if (b.zone[i] === 3) out.I++;
    }
  }
  return out;
}
