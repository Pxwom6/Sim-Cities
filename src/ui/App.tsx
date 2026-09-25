import { useEffect } from 'preact/hooks';
import type { Game } from '../game';
import { DebugPanel } from './DebugPanel';
import { GameContext } from './hooks';
import { TopBar } from './TopBar';

function Shortcuts({ game }: { game: Game }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Backquote') game.toggleDebug();
      else if (e.code === 'Space') {
        e.preventDefault();
        game.setSpeed(game.speed === 0 ? 1 : 0);
      } else if (e.code === 'Digit1') game.setSpeed(1);
      else if (e.code === 'Digit2') game.setSpeed(2);
      else if (e.code === 'Digit3') game.setSpeed(3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);
  return null;
}

export function App({ game }: { game: Game }) {
  return (
    <GameContext.Provider value={game}>
      <Shortcuts game={game} />
      <TopBar />
      <DebugPanel />
      <div class="hint">Drag to pan · right-drag to rotate · wheel to zoom · ` for debug</div>
    </GameContext.Provider>
  );
}
