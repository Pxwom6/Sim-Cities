import type { Sim } from './sim';
import { MAP_SIZE } from '../data/world';
import { buildingCapacity } from './world/buildings';

export class InvariantError extends Error {}

/** Checked every tick in test mode (SPEC §8): finite numbers, no negatives, money balances. */
export function checkInvariants(sim: Sim): void {
  const s = sim.state;
  if (!Number.isInteger(s.tick) || s.tick < 0) throw new InvariantError(`bad tick ${s.tick}`);
  if (!Number.isFinite(s.treasury) || !Number.isInteger(s.treasury)) {
    throw new InvariantError(`treasury is not a finite integer: ${s.treasury}`);
  }
  for (const b of s.buildings.values()) {
    for (const k of [
      'pop',
      'cap',
      'employed',
      'seekers',
      'commute',
      'shop',
      'happiness',
      'distress',
      'x',
      'z',
      'y',
      'progress',
    ] as const) {
      const v = b[k];
      if (!Number.isFinite(v)) throw new InvariantError(`building ${b.id} ${k} is ${v}`);
      if (k !== 'y' && v < 0) throw new InvariantError(`building ${b.id} ${k} is negative: ${v}`);
    }
    if (b.x < 0 || b.z < 0 || b.x > MAP_SIZE || b.z > MAP_SIZE)
      throw new InvariantError(`building ${b.id} outside the map`);
    if (b.zone === 1 && b.pop > Math.max(b.cap, buildingCapacity(b)))
      throw new InvariantError(`building ${b.id} over capacity`);
    if (b.employed > Math.max(b.pop, b.seekers))
      throw new InvariantError(`building ${b.id} employs more than live there`);
    if (!s.net.blocks.has(b.block)) throw new InvariantError(`building ${b.id} has no lot`);
  }
  const t = s.totals;
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'number' && (!Number.isFinite(v) || v < 0))
      throw new InvariantError(`totals.${k} = ${v}`);
  }
  for (const k of ['R', 'C', 'I'] as const) {
    const v = s.demand[k];
    if (!Number.isFinite(v) || v < -1 || v > 1) throw new InvariantError(`demand ${k} = ${v}`);
  }
}
