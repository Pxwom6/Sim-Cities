/** Original line icons (24×24 viewBox, stroke = currentColor). */
import type { JSX } from 'preact';

type P = JSX.SVGAttributes<SVGSVGElement>;
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

export const IconPause = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);
export const IconSpeed1 = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 6l7 6-7 6z" fill="currentColor" />
  </svg>
);
export const IconSpeed2 = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 6l6 6-6 6zM13 6l6 6-6 6z" fill="currentColor" />
  </svg>
);
export const IconSpeed3 = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 7l5 5-5 5zM10 7l5 5-5 5zM17 7l5 5-5 5z" fill="currentColor" stroke-width="1.5" />
  </svg>
);
