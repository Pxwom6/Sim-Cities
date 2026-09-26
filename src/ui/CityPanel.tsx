import { useState } from 'preact/hooks';
import { ACHIEVEMENTS } from '../data/achievements';
import { MILESTONES } from '../data/progression';
import { POLICIES, policyCost } from '../data/policies';
import { unlocksAt } from '../data/unlocks';
import { useGameUpdates } from './hooks';
import { IconCity, IconTrophy } from './icons';

type Tab = 'progress' | 'policies' | 'achievements';
const TABS: { id: Tab; name: string }[] = [
  { id: 'progress', name: 'Progress' },
  { id: 'policies', name: 'Policies' },
  { id: 'achievements', name: 'Achievements' },
];

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The city: milestones reached and next, policies in force, achievements. */
export function CityPanel() {
  const game = useGameUpdates(400);
  const [tab, setTab] = useState<Tab>('progress');
  if (game.panel !== 'city') return null;
  const st = game.world.stats;
  const k = st.milestone;
  const now = MILESTONES[k]!;
  const next = MILESTONES[k + 1];
  const frac = next ? Math.min(1, (st.peak - now.population) / (next.population - now.population)) : 1;
  return (
    <aside class="advisors city panel" data-testid="city-panel">
      <header>
        <h2>{now.name}</h2>
        <button class="btn icon" aria-label="Close" onClick={() => game.openPanel('city')}>
          ×
        </button>
      </header>
      <nav class="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            class={`tab ${tab === t.id ? 'active' : ''}`}
            data-testid={`city-tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.name}
          </button>
        ))}
      </nav>
      <div class="advisors-list">
        {tab === 'progress' && (
          <>
            <section class="milestone-card">
              <div class="milestone-now">{now.blurb}</div>
              {next ? (
                <>
                  <div class="milestone-bar" aria-label="Progress to the next milestone">
                    <span style={{ width: `${Math.round(frac * 100)}%` }} />
                  </div>
                  <div class="milestone-next">
                    Next: <strong>{next.name}</strong> at {next.population.toLocaleString('en-US')} residents
                  </div>
                  <ul class="unlock-list" data-testid="next-unlocks">
                    {unlocksAt(next.population).map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <div class="milestone-next">Every milestone reached.</div>
              )}
            </section>
            <section class="milestone-card">
              <h3>Tourism and trade</h3>
              <dl class="city-stats">
                <dt>Visitors a day</dt>
                <dd data-testid="city-visitors">{st.visitors.toLocaleString('en-US')}</dd>
              </dl>
              <p class="muted">
                Landmarks draw visitors (more with good approval and a tourism campaign); hotels keep them
                overnight, when they spend the most.
              </p>
            </section>
          </>
        )}
        {tab === 'policies' && (
          <ul class="policy-list">
            {POLICIES.map((p) => {
              const on = st.policies.includes(p.id);
              const locked = !st.unlockAll && st.peak < p.unlockPopulation;
              return (
                <li key={p.id} class={`policy ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked}
                      data-testid={`policy-${p.id}`}
                      onChange={(e) =>
                        void game.dispatch({
                          type: 'setPolicy',
                          id: p.id,
                          on: (e.target as HTMLInputElement).checked,
                        })
                      }
                    />
                    <span class="policy-name">{p.name}</span>
                    <span class="policy-cost">
                      {p.costBase || p.costPerResident ? `${money(policyCost(p, st.population))}/mo` : 'Free'}
                    </span>
                  </label>
                  <div class="policy-effect">
                    {locked ? `Unlocks at ${p.unlockPopulation.toLocaleString('en-US')} residents. ` : ''}
                    {p.effect}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {tab === 'achievements' && (
          <ul class="achievement-list" data-testid="achievements">
            {ACHIEVEMENTS.map((a) => {
              const got = st.achievements[a.id] !== undefined;
              return (
                <li key={a.id} class={`achievement ${got ? 'got' : ''}`}>
                  <IconTrophy width={20} height={20} />
                  <div>
                    <strong>{a.name}</strong>
                    <div class="muted">{a.blurb}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

/** Top-bar button for the city panel. */
export function CityButton() {
  const game = useGameUpdates(500);
  const got = Object.keys(game.world.stats.achievements).length;
  return (
    <button
      class={`btn icon city-btn ${game.panel === 'city' ? 'active' : ''}`}
      data-testid="open-city"
      title={`City: progress, policies and achievements (P) · ${got} of ${ACHIEVEMENTS.length} achievements`}
      aria-label="City"
      onClick={() => game.openPanel('city')}
    >
      <IconCity />
    </button>
  );
}

/** A celebratory banner when the city reaches a milestone, listing what it unlocked. */
export function MilestoneBanner() {
  const game = useGameUpdates(250);
  const c = game.celebration;
  if (!c) return null;
  const m = MILESTONES[c]!;
  return (
    <div
      class="milestone-banner panel"
      data-testid="milestone-banner"
      onClick={() => game.dismissCelebration()}
    >
      <div class="confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.15}s` }} />
        ))}
      </div>
      <div class="milestone-kicker">Milestone reached</div>
      <h2>{m.name}!</h2>
      <p>
        {m.population.toLocaleString('en-US')} residents. {m.blurb}
      </p>
      <ul class="unlock-list">
        {unlocksAt(m.population).map((u) => (
          <li key={u}>{u}</li>
        ))}
      </ul>
    </div>
  );
}
