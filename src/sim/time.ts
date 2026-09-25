/**
 * Compressed calendar: 1 tick = 1 game minute, and one day/night cycle is one calendar month.
 * See DESIGN.md §3.1.
 */
export const TICKS_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_MONTH = TICKS_PER_HOUR * HOURS_PER_DAY; // 1440
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR;
/** The game starts at 07:00 on the first month so the first view is in daylight. */
export const START_HOUR = 7;
export const START_TICK_OFFSET = START_HOUR * TICKS_PER_HOUR;

/** Ticks per real second at each speed (index = speed setting; 0 = paused). */
export const SPEED_TICKS_PER_SECOND = [0, 8, 16, 24] as const;
export type Speed = 0 | 1 | 2 | 3;

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface GameDate {
  year: number; // starts at 1
  month: number; // 0..11
  hour: number; // 0..23
  minute: number; // 0..59
  /** Time of day in [0, 1): 0 = midnight, 0.5 = noon. */
  dayFraction: number;
  /** Months elapsed since the start. */
  totalMonths: number;
}

export function dateOf(tick: number): GameDate {
  const t = tick + START_TICK_OFFSET;
  const totalMonths = Math.floor(t / TICKS_PER_MONTH);
  const inDay = t - totalMonths * TICKS_PER_MONTH;
  return {
    year: Math.floor(totalMonths / MONTHS_PER_YEAR) + 1,
    month: totalMonths % MONTHS_PER_YEAR,
    hour: Math.floor(inDay / TICKS_PER_HOUR),
    minute: inDay % TICKS_PER_HOUR,
    dayFraction: inDay / TICKS_PER_MONTH,
    totalMonths,
  };
}

/** Time of day in hours [0, 24) for a possibly fractional tick. */
export function hourOfDay(tick: number): number {
  const t = tick + START_TICK_OFFSET;
  const inDay = t - Math.floor(t / TICKS_PER_MONTH) * TICKS_PER_MONTH;
  return inDay / TICKS_PER_HOUR;
}

/** Number of ticks from `tick` until the clock next shows `hour`:00 (0 < result ≤ one day). */
export function ticksUntilHour(tick: number, hour: number): number {
  const now = hourOfDay(tick) * TICKS_PER_HOUR;
  let delta = hour * TICKS_PER_HOUR - now;
  if (delta <= 0) delta += TICKS_PER_MONTH;
  return Math.round(delta);
}

export function formatDate(d: GameDate): string {
  const hh = String(d.hour).padStart(2, '0');
  const mm = String(d.minute).padStart(2, '0');
  return `${MONTH_NAMES[d.month]}, Year ${d.year} — ${hh}:${mm}`;
}

/** True when this tick is the first tick of a new hour. */
export function isHourStart(tick: number): boolean {
  return (tick + START_TICK_OFFSET) % TICKS_PER_HOUR === 0;
}

/** True when this tick is the first tick of a new month (midnight). */
export function isMonthStart(tick: number): boolean {
  return (tick + START_TICK_OFFSET) % TICKS_PER_MONTH === 0;
}
