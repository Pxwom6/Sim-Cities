import { render, h } from 'preact';
import './ui/styles/main.css';
import { GAME_TITLE, IS_TEST_BUILD } from './config';
import { SimClient } from './client/simClient';
import { ClientWorld } from './client/world';
import { installTestApi } from './client/testApi';
import { GameRenderer } from './render/renderer';
import { Game } from './game';
import { App } from './ui/App';
import { MAP_PRESETS, MAP_SIZE, type MapPreset } from './data/world';
import { readSlot } from './client/saves';
import { AudioEngine } from './audio/engine';
import { loadSettings } from './client/settings';
import type { Difficulty, GameOptions } from './sim/state';

/** The map behind the main menu. */
const BACKDROP: Partial<GameOptions> = { seed: 'citybloom', preset: 'river' };

/**
 * New-game options from the URL (the new-game screen reloads the page with them; tests and dev
 * links use `?seed=…&preset=…&paused=1` directly).
 */
function optionsFrom(params: URLSearchParams): Partial<GameOptions> {
  const preset = params.get('preset') as MapPreset | null;
  const difficulty = params.get('difficulty') as Difficulty | null;
  const o: Partial<GameOptions> = {
    seed: params.get('seed') || 'citybloom',
    preset: preset && MAP_PRESETS.some((p) => p.id === preset) ? preset : 'river',
  };
  if (difficulty && ['easy', 'normal', 'hard'].includes(difficulty)) o.difficulty = difficulty;
  if (params.has('sandbox')) o.sandbox = params.get('sandbox') === '1';
  o.disasters = params.has('disasters') ? params.get('disasters') === '1' : loadSettings().disasters;
  const name = params.get('name')?.trim();
  if (name) o.cityName = name.slice(0, 40);
  return o;
}

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const params = new URLSearchParams(location.search);
  // Without a city to open, show the main menu over a backdrop map.
  const menu = !['paused', 'seed', 'preset', 'load', 'new'].some((k) => params.has(k));
  const client = new SimClient();
  const loadSlot = params.get('load');
  const save = loadSlot ? await readSlot(loadSlot).catch(() => null) : null;
  const snap = save
    ? await client.load(save, IS_TEST_BUILD)
    : await client.init(menu ? BACKDROP : optionsFrom(params), IS_TEST_BUILD);
  const world = new ClientWorld(snap);
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new GameRenderer(canvas, world);
  const game = new Game(client, world, renderer);
  game.audio = new AudioEngine(game.settings);
  if (menu) {
    game.mode = 'menu';
    game.setSpeed(0);
    game.openScreen('main');
    // Low over the valley, looking across the river to the hills.
    game.setCamera({ x: MAP_SIZE * 0.44, z: MAP_SIZE * 0.54, distance: 1300, yaw: 2.2, tilt: -0.25 });
  } else {
    // A loaded city opens paused, so the player can get their bearings; a new one starts running.
    game.setSpeed(params.get('paused') === '1' || save ? 0 : 1);
    game.setCamera('overview', true);
    if (save && loadSlot) game.slot = loadSlot === 'import' ? null : loadSlot;
    if (loadSlot && !save)
      game.toast('That save could not be found; here is a fresh map instead.', 'bad', 6000);
    if (params.get('tutorial') === '1') game.startTutorial();
    // A reload goes back to the main menu (Continue picks up the latest save) rather than
    // re-creating this city from scratch.
    if (params.has('new') || params.has('load')) history.replaceState(null, '', location.pathname);
  }
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
