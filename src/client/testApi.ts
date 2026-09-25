import type { Game } from '../game';
import type { Command, CommandResult } from '../sim/commands';
import type { CameraPose, CameraPresetName } from '../render/camera';
import type { RenderStats } from '../render/renderer';
import type { CityStats } from '../sim/protocol';

export interface TestApi {
  ready: boolean;
  dispatch(cmd: Command): Promise<CommandResult>;
  getState(): Promise<CityStats & { renderStats: RenderStats; tick: number }>;
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
      return { ...stats, renderStats: game.renderer.lastStats };
    },
    advance: async (ticks) => {
      const t = await game.client.advance(ticks);
      game.world.displayTick = t;
      return t;
    },
    setCamera: (preset) => game.setCamera(preset, true),
    getCamera: () => ({ ...game.renderer.controller.goal }),
    hash: () => game.client.query<string>({ type: 'hash' }),
    setSpeed: (s) => game.setSpeed(s),
    waitFrames: (n) =>
      new Promise((resolve) => {
        let k = 0;
        const step = () => (++k >= n ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    errors: [],
  };
  window.__game = api;
  return api;
}
