import { useGame, useGameUpdates } from './hooks';

/** The menu button: opens the pause menu (save, load, settings, quit); shows autosaves happening. */
export function SystemMenu() {
  const game = useGameUpdates(250);
  return (
    <div class="sysmenu">
      {game.saving && (
        <span class="saving" data-testid="saving" aria-live="polite">
          Saving…
        </span>
      )}
      <button
        class="btn icon"
        aria-label="Menu"
        title="Menu: save, load, settings (Esc)"
        data-testid="menu-button"
        onClick={() => game.openScreen('pause')}
      >
        ☰
      </button>
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
