import { MILESTONES } from '../../data/progression';
import type { Sim } from '../sim';

/**
 * Hourly: remember the highest population reached (unlocks keep once earned) and announce each
 * milestone the first time the city gets there.
 */
export function progressHour(sim: Sim): void {
  const p = sim.state.progress;
  const pop = sim.state.totals.population;
  if (pop > p.peak) p.peak = pop;
  while (p.milestone + 1 < MILESTONES.length && p.peak >= MILESTONES[p.milestone + 1]!.population) {
    p.milestone++;
    sim.events.push({ kind: 'milestone', id: p.milestone });
  }
}
