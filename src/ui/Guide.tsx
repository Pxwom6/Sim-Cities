import { useEffect } from 'preact/hooks';
import { TUTORIAL } from '../client/tutorial';
import { useGameUpdates } from './hooks';

/** Pulse the button a tutorial step points at. */
function useHighlight(testid: string | undefined) {
  useEffect(() => {
    if (!testid) return;
    // A data attribute rather than a class: Preact owns the class list and may rewrite it.
    const el = document.querySelector(`[data-testid="${testid}"]`);
    el?.setAttribute('data-guide', '');
    return () => el?.removeAttribute('data-guide');
  }, [testid]);
}

/** The first-city tutorial: one step at a time, each ticking itself off when done. */
export function TutorialCard() {
  const game = useGameUpdates(300);
  const k = game.settings.tutorialStep;
  const step = k >= 0 ? TUTORIAL[k] : undefined;
  const visible = !!step && game.mode === 'play' && !game.screen && !game.panel;
  useHighlight(visible ? step.target : undefined);
  if (!visible) return null;
  return (
    <div class="guide panel" data-testid="tutorial" role="dialog" aria-label="Tutorial">
      <div class="guide-kicker">
        Tutorial · step {k + 1} of {TUTORIAL.length}
      </div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div class="guide-progress" aria-hidden="true">
        {TUTORIAL.map((_, i) => (
          <span key={i} class={i < k ? 'done' : i === k ? 'now' : ''} />
        ))}
      </div>
      <div class="guide-actions">
        <button class="btn quiet" data-testid="tutorial-skip" onClick={() => game.endTutorial()}>
          Skip tutorial
        </button>
        {!step.done && (
          <button class="btn active" data-testid="tutorial-next" onClick={() => game.tutorialNext()}>
            {k === TUTORIAL.length - 1 ? 'Finish' : 'Next'}
          </button>
        )}
        {step.done && <span class="guide-waiting">Waiting for you…</span>}
      </div>
    </div>
  );
}

/** A contextual tip, shown once when its moment comes. */
export function TipCard() {
  const game = useGameUpdates(300);
  const tip = game.tip;
  if (!tip || game.mode !== 'play' || game.screen || game.panel) return null;
  return (
    <div class="guide tip-card panel" data-testid="tip" role="status">
      <div class="guide-kicker">Tip</div>
      <p>{tip.text}</p>
      <div class="guide-actions">
        <button class="btn quiet" data-testid="tip-off" onClick={() => game.dismissTip(true)}>
          No more tips
        </button>
        <button class="btn active" data-testid="tip-ok" onClick={() => game.dismissTip()}>
          Got it
        </button>
      </div>
    </div>
  );
}
