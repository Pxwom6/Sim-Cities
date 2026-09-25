import { useEffect, useState } from 'preact/hooks';
import { DENSITY_NAMES, INDUSTRY_TIER_NAMES, WEALTH_NAMES } from '../data/buildings';
import type { BuildingDetails, CivicDetails } from '../sim/protocol';
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
  if (game.selected?.kind === 'civic') return <CivicInspector id={game.selected.id} />;
  return <BuildingInspector id={game.selected?.id ?? null} />;
}

function Supply({ label, v }: { label: string; v: number }) {
  return (
    <>
      <dt>{label}</dt>
      <dd class={v < 0.999 ? 'neg' : ''}>
        {v >= 0.999 ? 'Yes' : v <= 0 ? 'None' : `${Math.round(v * 100)}%`}
      </dd>
    </>
  );
}

function CivicInspector({ id }: { id: number }) {
  const game = useGameUpdates(200);
  const [d, setD] = useState<CivicDetails | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void game.client.query<CivicDetails | null>({ type: 'civic', id }).then((r) => live && setD(r));
    load();
    const t = setInterval(load, 700);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id, game]);
  if (!d) return null;
  const UNIT: Record<string, string> = { power: 'Power', water: 'Water', sewage: 'Sewage handled' };
  return (
    <aside class="inspector panel" data-testid="inspector">
      <header>
        <div>
          <h2>{d.name}</h2>
          <div class="sub">{d.blurb}</div>
        </div>
        <button class="btn icon" aria-label="Close" onClick={() => game.select(null)}>
          ×
        </button>
      </header>
      {!d.access && <div class="warn">Not facing a road: it can't reach anyone.</div>}
      {d.polluted && (
        <div class="warn">
          The ground here is polluted, so this pump's water is too. Move it away from outflows, landfills and
          heavy industry.
        </div>
      )}
      <dl>
        {d.produces.map((p) => (
          <>
            <dt key={p.utility}>{UNIT[p.utility] ?? p.utility}</dt>
            <dd>{p.output.toLocaleString('en-US')} units</dd>
          </>
        ))}
        {d.garbage && (
          <>
            <dt>Trucks out</dt>
            <dd>
              {d.garbage.out} / {d.garbage.trucks}
            </dd>
            {d.garbage.storage > 0 && (
              <>
                <dt>Landfill used</dt>
                <dd class={d.garbage.stored >= d.garbage.storage ? 'neg' : ''}>
                  {Math.round((d.garbage.stored / d.garbage.storage) * 100)}%
                </dd>
              </>
            )}
            {d.garbage.process > 0 && (
              <>
                <dt>Processed today</dt>
                <dd>
                  {d.garbage.processedToday} / {d.garbage.process}
                </dd>
              </>
            )}
          </>
        )}
        <dt>Upkeep</dt>
        <dd>
          ${d.upkeep.toLocaleString('en-US')}/month ({d.funding}% funding)
        </dd>
      </dl>
      <footer>
        <button
          class="btn danger"
          onClick={() => {
            void game.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: d.id } });
            game.select(null);
          }}
        >
          Bulldoze (refund ${d.refund.toLocaleString('en-US')})
        </button>
      </footer>
    </aside>
  );
}

function BuildingInspector({ id }: { id: number | null }) {
  const game = useGameUpdates(200);
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
        {d.state === 1 && (
          <>
            <Supply label="Power" v={d.power} />
            <Supply label="Water" v={d.water} />
            <Supply label="Sewage" v={d.sewage} />
            <dt>Garbage waiting</dt>
            <dd class={d.garbage >= 20 ? 'neg' : ''}>{d.garbage} units</dd>
          </>
        )}
      </dl>
      {d.closed && (
        <div class="warn">Closed: no power or water for too long. It reopens once both are back.</div>
      )}
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
