import { useRef, useState } from 'preact/hooks';
import { exportSave, importSaveFile, writeSlot } from '../client/saves';
import { useGame } from './hooks';
import type { Settings } from '../client/settings';

const VOLUMES: [keyof Settings, string][] = [
  ['masterVolume', 'Master'],
  ['effectsVolume', 'Effects'],
  ['ambientVolume', 'Ambience'],
];

/** Volume sliders and mute (the full settings screen arrives with the game shell in M11). */
function SoundSettings() {
  const game = useGame();
  const s = game.settings;
  return (
    <div class="menu-sound" data-testid="sound-settings">
      <div class="menu-heading">Sound</div>
      {VOLUMES.map(([key, name]) => (
        <label key={key} class="volume-row">
          <span>{name}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round((s[key] as number) * 100)}
            disabled={s.muted}
            data-testid={`vol-${key}`}
            onInput={(e) =>
              game.updateSettings({ [key]: Number((e.target as HTMLInputElement).value) / 100 })
            }
          />
          <span class="val">{Math.round((s[key] as number) * 100)}</span>
        </label>
      ))}
      <label class="volume-mute">
        <input
          type="checkbox"
          checked={s.muted}
          data-testid="mute"
          onChange={(e) => game.updateSettings({ muted: (e.target as HTMLInputElement).checked })}
        />
        Mute all sound
      </label>
    </div>
  );
}

/** Save / load / export / import (a fuller slots screen arrives with the game shell in M11). */
export function SystemMenu() {
  const game = useGame();
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = async (slot: string) => {
    try {
      const s = await game.client.save();
      await writeSlot(slot, s);
      game.toast(`Saved “${s.meta.cityName}”`, 'ok');
    } catch (e) {
      game.toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'bad');
    }
    setOpen(false);
  };
  return (
    <div class="sysmenu">
      <button class="btn icon" aria-label="Menu" data-testid="menu-button" onClick={() => setOpen(!open)}>
        ☰
      </button>
      {open && (
        <div class="sysmenu-pop panel" data-testid="menu">
          <button class="menu-item" data-testid="menu-save" onClick={() => void save('quick')}>
            Quick save
          </button>
          <button class="menu-item" data-testid="menu-load" onClick={() => (location.search = '?load=quick')}>
            Load quick save
          </button>
          <button
            class="menu-item"
            onClick={async () => {
              exportSave(await game.client.save());
              setOpen(false);
            }}
          >
            Export to file…
          </button>
          <button class="menu-item" onClick={() => file.current?.click()}>
            Import from file…
          </button>
          <input
            ref={file}
            type="file"
            accept=".citybloom,application/octet-stream,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (!f) return;
              try {
                const s = await importSaveFile(f);
                await writeSlot('import', s);
                location.search = '?load=import';
              } catch (err) {
                game.toast(
                  `That file isn't a readable save (${err instanceof Error ? err.message : String(err)})`,
                  'bad',
                );
              }
            }}
          />
          <SoundSettings />
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const game = useGame();
  return (
    <div class={`toasts ${game.selected ? 'beside-panel' : ''}`} aria-live="polite">
      {game.toasts.map((t) => (
        <div
          key={t.id}
          class={`toast ${t.tone} ${t.at ? 'clickable' : ''}`}
          data-testid="toast"
          onClick={() => t.at && game.flyTo(t.at)}
          title={t.at ? 'Show me' : undefined}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
