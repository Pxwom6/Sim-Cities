import { ticksUntilHour, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../sim/time';
import type { CameraPresetName } from '../render/camera';
import { formatNumber, useGameUpdates } from './hooks';

const PRESETS: CameraPresetName[] = ['overview', 'city', 'street', 'aerial', 'highway'];

export function DebugPanel() {
  const game = useGameUpdates(250);
  if (!game.debugOpen) return null;
  const r = game.renderer.lastStats;
  const p = game.perf;
  const advance = (ticks: number) => {
    void game.client.advance(ticks).then((t) => (game.world.displayTick = t));
  };
  return (
    <div class="debug" data-testid="debug-panel">
      <h3>Debug</h3>
      <table>
        <tbody>
          <tr>
            <td>FPS / frame</td>
            <td>
              {game.fps.toFixed(0)} / {game.frameMs.toFixed(1)} ms
            </td>
          </tr>
          <tr>
            <td>Sim tick avg / max</td>
            <td>
              {p.tickMsAvg.toFixed(3)} / {p.tickMsMax.toFixed(2)} ms
            </td>
          </tr>
          <tr>
            <td>Ticks/s (dropped)</td>
            <td>
              {p.ticksPerSecond.toFixed(1)} ({p.droppedTicks})
            </td>
          </tr>
          <tr>
            <td>Tick</td>
            <td>{formatNumber(game.world.stats.tick)}</td>
          </tr>
          <tr>
            <td>Draw calls / triangles</td>
            <td>
              {r.calls} / {formatNumber(r.triangles)}
            </td>
          </tr>
          <tr>
            <td>Geometries / textures</td>
            <td>
              {r.geometries} / {r.textures}
            </td>
          </tr>
          <tr>
            <td>Trees</td>
            <td>{formatNumber(r.trees)}</td>
          </tr>
        </tbody>
      </table>
      <h3 style={{ marginTop: '0.6rem' }}>Cheats</h3>
      <div class="row">
        <button
          class="btn"
          onClick={() => void game.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 100_000 })}
        >
          +$100k
        </button>
        <button class="btn" onClick={() => advance(TICKS_PER_HOUR)}>
          +1 hour
        </button>
        <button class="btn" onClick={() => advance(TICKS_PER_MONTH)}>
          +1 month
        </button>
        <button class="btn" onClick={() => advance(ticksUntilHour(game.world.stats.tick, 12))}>
          → noon
        </button>
        <button class="btn" onClick={() => advance(ticksUntilHour(game.world.stats.tick, 21))}>
          → night
        </button>
      </div>
      <h3 style={{ marginTop: '0.6rem' }}>Camera</h3>
      <div class="row">
        {PRESETS.map((name) => (
          <button key={name} class="btn" onClick={() => game.setCamera(name, false)}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
