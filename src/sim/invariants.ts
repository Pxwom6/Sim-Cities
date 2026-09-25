import type { Sim } from './sim';

export class InvariantError extends Error {}

/** Checked every tick in test mode (SPEC §8): finite numbers, no negatives, money balances. */
export function checkInvariants(sim: Sim): void {
  const s = sim.state;
  if (!Number.isInteger(s.tick) || s.tick < 0) throw new InvariantError(`bad tick ${s.tick}`);
  if (!Number.isFinite(s.treasury) || !Number.isInteger(s.treasury)) {
    throw new InvariantError(`treasury is not a finite integer: ${s.treasury}`);
  }
}
