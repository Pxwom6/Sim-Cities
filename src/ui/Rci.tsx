import { useState } from 'preact/hooks';
import type { Factor } from '../sim/systems/demand';
import { useGameUpdates } from './hooks';

const ZONES = [
  { k: 'R', name: 'Residential', cls: 'r' },
  { k: 'C', name: 'Commercial', cls: 'c' },
  { k: 'I', name: 'Industrial', cls: 'i' },
] as const;

function pct(v: number): string {
  const n = Math.round(v * 100);
  return `${n > 0 ? '+' : ''}${n}`;
}

/** Three demand bars (−1..1 around a centre line); hover explains each one. */
export function Rci() {
  const game = useGameUpdates(300);
  const [open, setOpen] = useState(false);
  const d = game.world.stats.demand;
  const f = game.world.stats.demandFactors;
  return (
    <div
      class="rci"
      data-testid="rci"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-label="Zone demand"
    >
      {ZONES.map(({ k, cls }) => {
        const v = d[k];
        const h = Math.min(1, Math.abs(v)) * 50;
        return (
          <div class={`rci-col ${cls}`} key={k}>
            <div class="rci-track">
              <div class="rci-bar" style={{ height: `${h}%`, [v >= 0 ? 'bottom' : 'top']: '50%' }} />
            </div>
            <span>{k}</span>
          </div>
        );
      })}
      {open && (
        <div class="rci-pop panel" role="tooltip">
          {ZONES.map(({ k, name, cls }) => (
            <div key={k} class="rci-section">
              <div class={`rci-head ${cls}`}>
                <strong>{name} demand</strong>
                <span>{pct(d[k])}</span>
              </div>
              {(f[k] as Factor[]).length === 0 && (
                <div class="rci-line muted">No strong pull either way.</div>
              )}
              {(f[k] as Factor[]).map((x) => (
                <div class="rci-line" key={x.label}>
                  <span>{x.label}</span>
                  <span class={x.value >= 0 ? 'pos' : 'neg'}>{pct(x.value)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
