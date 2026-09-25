import { render, h } from 'preact';
import './ui/styles/main.css';
import { GAME_TITLE, IS_TEST_BUILD } from './config';
import { SimClient } from './client/simClient';
import { ClientWorld } from './client/world';
import { installTestApi } from './client/testApi';
import { GameRenderer } from './render/renderer';
import { Game } from './game';
import { App } from './ui/App';
import type { MapPreset } from './data/world';
import { readSlot } from './client/saves';

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const params = new URLSearchParams(location.search);
  const client = new SimClient();
  const loadSlot = params.get('load');
  const save = loadSlot ? await readSlot(loadSlot).catch(() => null) : null;
  const snap = save
    ? await client.load(save, IS_TEST_BUILD)
    : await client.init(
        {
          seed: params.get('seed') ?? 'citybloom',
          preset: (params.get('preset') as MapPreset | null) ?? 'river',
        },
        IS_TEST_BUILD,
      );
  const world = new ClientWorld(snap);
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new GameRenderer(canvas, world);
  const game = new Game(client, world, renderer);
  const paused = params.get('paused') === '1';
  game.setSpeed(paused ? 0 : 1);
  game.setCamera('overview', true);
  render(h(App, { game }), document.getElementById('ui')!);
  if (IS_TEST_BUILD) installTestApi(game);

  const loop = (now: number) => {
    game.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.getElementById('boot')?.classList.add('hidden');
}

void boot();
