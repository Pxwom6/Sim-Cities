import { useState } from 'preact/hooks';

/**
 * Small SVG charts for the budget (one axis each, thin marks, recessive grid, hover tooltip).
 * Colours come from CSS tokens (--chart-*).
 */
export interface Point {
  label: string;
  value: number;
}

const W = 300;
const H = 120;
const PAD = { l: 44, r: 8, t: 10, b: 20 };

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) max = min + 1;
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? mag * 10;
  const out: number[] = [];
  const top = Math.ceil(max / step - 1e-9) * step;
  for (let v = Math.floor(min / step + 1e-9) * step; v <= top + step * 1e-6; v += step)
    out.push(Math.round(v * 1e6) / 1e6);
  if (out.length < 2) out.push(out[0]! + step);
  return out;
}

export function compactMoney(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}

function Frame(props: {
  ticks: number[];
  y: (v: number) => number;
  children: preact.ComponentChildren;
  title: string;
}) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="chart" role="img" aria-label={props.title}>
      {props.ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={props.y(t)}
            y2={props.y(t)}
            class={t === 0 ? 'chart-base' : 'chart-grid'}
          />
          <text x={PAD.l - 6} y={props.y(t) + 3} class="chart-tick" text-anchor="end">
            {compactMoney(t)}
          </text>
        </g>
      ))}
      {props.children}
    </svg>
  );
}

/** Single-series line with a crosshair tooltip. */
export function LineChart({ points, title }: { points: Point[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div class="chart-empty">History appears after the first month closes.</div>;
  const vals = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (points.length - 1);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo || 1));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const hp = hover !== null ? points[hover] : null;
  return (
    <div class="chart-wrap">
      <Frame ticks={ticks} y={y} title={title}>
        <path d={d} class="chart-line" />
        {hover !== null && hp && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} class="chart-cross" />
            <circle cx={x(hover)} cy={y(hp.value)} r={4} class="chart-dot" />
          </g>
        )}
        <text x={PAD.l} y={H - 4} class="chart-tick">
          {points[0]!.label}
        </text>
        <text x={W - PAD.r} y={H - 4} class="chart-tick" text-anchor="end">
          {points[points.length - 1]!.label}
        </text>
        <rect
          x={PAD.l}
          y={PAD.t}
          width={W - PAD.l - PAD.r}
          height={H - PAD.t - PAD.b}
          fill="transparent"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
            const f = (e.clientX - r.left) / r.width;
            setHover(Math.max(0, Math.min(points.length - 1, Math.round(f * (points.length - 1)))));
          }}
          onMouseLeave={() => setHover(null)}
        />
      </Frame>
      {hp && (
        <div class="chart-tip">
          <strong>{hp.label}</strong> {compactMoney(hp.value)}
        </div>
      )}
    </div>
  );
}

/** Bars around a zero baseline; positive and negative use the two diverging poles. */
export function BarChart({ points, title }: { points: Point[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <div class="chart-empty">No months closed yet.</div>;
  const vals = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo || 1));
  const slot = (W - PAD.l - PAD.r) / points.length;
  const bw = Math.max(2, Math.min(14, slot - 2));
  const hp = hover !== null ? points[hover] : null;
  return (
    <div class="chart-wrap">
      <Frame ticks={ticks} y={y} title={title}>
        {points.map((p, i) => {
          const x0 = PAD.l + slot * i + (slot - bw) / 2;
          const top = Math.min(y(p.value), y(0));
          const h = Math.max(1, Math.abs(y(p.value) - y(0)));
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={PAD.l + slot * i}
                y={PAD.t}
                width={slot}
                height={H - PAD.t - PAD.b}
                fill="transparent"
              />
              <rect
                x={x0}
                y={top}
                width={bw}
                height={h}
                rx={Math.min(4, bw / 2)}
                class={p.value >= 0 ? 'chart-bar-pos' : 'chart-bar-neg'}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            </g>
          );
        })}
        <text x={PAD.l} y={H - 4} class="chart-tick">
          {points[0]!.label}
        </text>
        <text x={W - PAD.r} y={H - 4} class="chart-tick" text-anchor="end">
          {points[points.length - 1]!.label}
        </text>
      </Frame>
      {hp && (
        <div class="chart-tip">
          <strong>{hp.label}</strong> {hp.value >= 0 ? '+' : ''}
          {compactMoney(hp.value)}
        </div>
      )}
    </div>
  );
}
