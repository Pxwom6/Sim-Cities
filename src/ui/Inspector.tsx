import { useEffect, useState } from 'preact/hooks';
import { DENSITY_NAMES, INDUSTRY_TIER_NAMES, WEALTH_NAMES } from '../data/buildings';
import type { BuildingDetails } from '../sim/protocol';
import { formatNumber, useGameUpdates } from './hooks';

const ZONE_NAMES = ['', 'Residential', 'Commercial', 'Industrial'];
const STATE_NAMES = ['Under construction', 'Occupied', 'Abandoned', 'Rubble'];

function Mood({ value }: { value: number }) {
  const tone = value >= 0.65 ? 'good' : value >= 0.4 ? 'ok' : 'bad';
  return (
    <div class="mood">
      <div class="mood-track">
        <div class={`mood-fill ${tone}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span>{Math.round(value * 100)}%</span>
    </div>
  );
}

/** Details of the selected building: who lives or works there, its mood and why. */
export function Inspector() {
  const game = useGameUpdates(200);
  const id = game.selected;
  const [d, setD] = useState<BuildingDetails | null>(null);
  useEffect(() => {
    if (id === null) {
      setD(null);
      return;
    }
    let live = true;
    const load = () =>
      void game.client.query<BuildingDetails | null>({ type: 'building', id }).then((r) => live && setD(r));
    load();
    const t = setInterval(load, 600);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id, game]);
  if (id === null || !d) return null;
  const kind =
    d.zone === 3
      ? `${DENSITY_NAMES[d.density]} industry · ${INDUSTRY_TIER_NAMES[d.wealth]}`
      : `${DENSITY_NAMES[d.density]} ${ZONE_NAMES[d.zone]!.toLowerCase()} · ${WEALTH_NAMES[d.wealth]}`;
  const people = d.isResidential ? 'Residents' : 'Workers';
  const left = d.abandonAt - d.distress;
  return (
    <aside class="inspector panel" data-testid="inspector">
      <header>
        <div>
          <h2>{d.name}</h2>
          <div class="sub">
            {kind} · Level {d.level}
          </div>
        </div>
        <button class="btn icon" aria-label="Close" onClick={() => game.select(null)}>
          ×
        </button>
      </header>
      <div class={`status s${d.state}`}>
        {STATE_NAMES[d.state]}
        {d.state === 0 ? ` · ${Math.round(d.progress * 100)}%` : ''}
      </div>
      {!d.connected && <div class="warn">No road link to the highway: nobody can reach this building.</div>}
      <dl>
        <dt>{people}</dt>
        <dd data-testid="inspector-pop">
          {formatNumber(d.pop)} / {formatNumber(d.cap)}
        </dd>
        {d.isResidential && (
          <>
            <dt>Employed</dt>
            <dd>{formatNumber(d.employed)}</dd>
            <dt>Commute</dt>
            <dd>{d.employed > 0 ? `${Math.max(1, Math.round(d.commute / 60))} min` : '—'}</dd>
            <dt>Shopping nearby</dt>
            <dd>{Math.round(d.shop * 100)}%</dd>
          </>
        )}
        {d.zone === 2 && (
          <>
            <dt>Customers</dt>
            <dd>{Math.round(d.shop * 100)}% of capacity</dd>
          </>
        )}
      </dl>
      {d.factors.length > 0 && (
        <section>
          <h3>Mood</h3>
          <Mood value={d.happiness} />
          <ul class="factors" data-testid="inspector-factors">
            {d.factors.map((f) => (
              <li key={f.label} class={f.value > 0.004 ? 'pos' : f.value < -0.004 ? 'neg' : 'neutral'}>
                <span>{f.label}</span>
                <span>
                  {f.value > 0 ? '+' : ''}
                  {Math.round(f.value * 100)}%
                </span>
              </li>
            ))}
          </ul>
          {d.distress > 0 && d.state === 1 && (
            <div class="warn">
              Unhappy: {d.isResidential ? 'residents will move out' : 'the business will close'} in about{' '}
              {Math.max(1, Math.round(left))} hours if nothing changes.
            </div>
          )}
        </section>
      )}
      <footer>
        <button
          class="btn danger"
          onClick={() => {
            void game.dispatch({ type: 'bulldoze', target: { kind: 'building', id: d.id } });
            game.select(null);
          }}
        >
          Bulldoze
        </button>
      </footer>
    </aside>
  );
}
