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

const VEHICLE_NAMES: Record<string, string> = {
  fire: 'Fire engines',
  police: 'Patrol cars',
  health: 'Ambulances',
};

const SERVICE_ROWS = [
  ['fire', 'Fire'],
  ['police', 'Police'],
  ['health', 'Health care'],
  ['education', 'Education'],
  ['park', 'Parks'],
] as const;

function Coverage({ label, v }: { label: string; v: number }) {
  const tone = v >= 0.65 ? 'good' : v >= 0.3 ? 'ok' : 'bad';
  return (
    <li class="cov">
      <span>{label}</span>
      <div class="mood-track">
        <div class={`mood-fill ${tone}`} style={{ width: `${Math.round(v * 100)}%` }} />
      </div>
      <span>{Math.round(v * 100)}%</span>
    </li>
  );
}

/** What would help most: the biggest negative mood factors, as suggestions. */
const NEEDS: [RegExp, string][] = [
  [/no power|power shortage/i, 'Power: build or expand a power plant within reach'],
  [/no water|water shortage/i, 'Water: add a pump connected by road'],
  [/sewage/i, 'Sewage: build an outflow or treatment plant'],
  [/polluted tap water/i, 'Clean water: move pumps away from pollution'],
  [/garbage/i, 'Garbage collection: a landfill with free trucks nearby'],
  [/no fire station/i, 'A fire station within reach'],
  [/no police/i, 'A police station within reach'],
  [/no health care/i, 'A clinic or hospital within reach'],
  [/no school/i, 'School seats nearby'],
  [/crime/i, 'Police patrols to bring crime down'],
  [/without jobs/i, 'Jobs: zone commercial or industry'],
  [/long commute/i, 'Jobs closer to home, or faster roads'],
  [/few shops/i, 'Shops nearby: zone commercial'],
  [/too few customers/i, 'More homes nearby to shop here'],
  [/not enough workers/i, 'More homes within commuting distance'],
  [/taxes are high/i, 'Lower taxes'],
  [/highway/i, 'A road link to the highway'],
  [/neighbourhood/i, 'Parks and services to raise land value'],
];

function needsOf(d: BuildingDetails): string[] {
  const out: string[] = [];
  for (const f of [...d.factors].sort((a, b) => a.value - b.value)) {
    if (f.value > -0.02) break;
    const hit = NEEDS.find(([re]) => re.test(f.label));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
    if (out.length >= 3) break;
  }
  return out;
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
        {d.service && (
          <>
            {d.service.vehicles > 0 && (
              <>
                <dt>{VEHICLE_NAMES[d.service.kind] ?? 'Vehicles'} out</dt>
                <dd data-testid="civic-vehicles">
                  {d.service.out} / {d.service.vehicles}
                </dd>
              </>
            )}
            {d.service.seats > 0 && (
              <>
                <dt>Seats filled</dt>
                <dd class={d.service.used >= d.service.seats ? 'neg' : ''}>
                  {d.service.used.toLocaleString('en-US')} / {d.service.seats.toLocaleString('en-US')}
                </dd>
              </>
            )}
            <dt>Buildings covered</dt>
            <dd data-testid="civic-reach">{d.service.reach.toLocaleString('en-US')}</dd>
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
      {d.fire > 0 && (
        <div class="warn fire" data-testid="inspector-fire">
          On fire ({Math.round(d.fire * 100)}%).{' '}
          {d.coverage.fire > 0 ? 'Fire engines are on their way.' : 'No fire station can reach it quickly.'}
        </div>
      )}
      {d.state === 3 && <div class="warn">Burned down. The rubble is cleared after a day or so.</div>}
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
          {needsOf(d).length > 0 && (
            <div class="needs" data-testid="inspector-needs">
              <h4>Would help</h4>
              <ul>
                {needsOf(d).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {d.distress > 0 && d.state === 1 && (
            <div class="warn">
              Unhappy: {d.isResidential ? 'residents will move out' : 'the business will close'} in about{' '}
              {Math.max(1, Math.round(left))} hours if nothing changes.
            </div>
          )}
        </section>
      )}
      {d.state === 1 && (
        <section>
          <h3>Services</h3>
          <ul class="coverage" data-testid="inspector-coverage">
            {SERVICE_ROWS.filter(([k]) => d.isResidential || (k !== 'education' && k !== 'health')).map(
              ([k, label]) => (
                <Coverage key={k} label={label} v={d.coverage[k]} />
              ),
            )}
          </ul>
          <div class="sub">Crime nearby: {d.crime < 0.05 ? 'low' : d.crime < 0.3 ? 'some' : 'high'}</div>
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
