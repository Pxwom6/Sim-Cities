import { createContext } from 'preact';
import { useContext, useEffect, useReducer } from 'preact/hooks';
import type { Game } from '../game';

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error('GameContext missing');
  return g;
}

/** Re-render when the game notifies, at most every `throttleMs`. */
export function useGameUpdates(throttleMs = 150): Game {
  const game = useGame();
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = game.subscribe(() => {
      const now = performance.now();
      if (now - last >= throttleMs) {
        last = now;
        force(0);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = performance.now();
          force(0);
        }, throttleMs);
      }
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [game, throttleMs]);
  return game;
}

export function formatMoney(v: number): string {
  const sign = v < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
}

export function formatNumber(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}
