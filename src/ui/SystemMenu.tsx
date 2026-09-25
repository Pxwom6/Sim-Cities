import { useRef, useState } from 'preact/hooks';
import { exportSave, importSaveFile, writeSlot } from '../client/saves';
import { useGame } from './hooks';

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
