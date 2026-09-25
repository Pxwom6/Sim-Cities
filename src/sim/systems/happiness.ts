import { DEMAND, HAPPINESS } from '../../data/balance';
import { ZONE_C, ZONE_R } from '../../data/zones';
import type { Sim } from '../sim';
import { BState, type Building } from '../world/buildings';
import type { Factor } from './demand';
import { landValueAt } from './landValue';

const ZONE_LETTER = ['R', 'R', 'C', 'I'] as const;

/**
 * Named happiness contributions for one building (DESIGN §3.9). Later milestones add utilities,
 * services, pollution, crime and sickness. The sum plus the base is the building's mood.
 */
export function happinessFactors(sim: Sim, b: Building): Factor[] {
  const f: Factor[] = [];
  const connected = sim.isBuildingConnected(b);
  if (!connected) f.push({ label: 'No road link to the highway', value: HAPPINESS.noHighwayAccess });
  const tax = sim.taxRate(ZONE_LETTER[b.zone]!, b.wealth);
  const taxTerm = HAPPINESS.taxPerPoint * (tax - DEMAND.neutralTax) * HAPPINESS.taxSensitivity[b.wealth]!;
  if (b.zone === ZONE_R) {
    const workers = b.seekers;
    if (workers > 0) {
      const unemployed = Math.max(0, workers - b.employed) / workers;
      f.push({
        label: unemployed > 0.05 ? 'Residents without jobs' : 'Everyone has a job',
        value: HAPPINESS.unemployment * unemployed,
      });
      if (b.employed > 0) {
        const t = b.commute;
        let v: number;
        if (t <= HAPPINESS.commuteGoodSeconds) v = HAPPINESS.commuteGood;
        else if (t >= HAPPINESS.commuteBadSeconds) v = HAPPINESS.commuteBad;
        else {
          const k =
            (t - HAPPINESS.commuteGoodSeconds) / (HAPPINESS.commuteBadSeconds - HAPPINESS.commuteGoodSeconds);
          v = HAPPINESS.commuteGood + (HAPPINESS.commuteBad - HAPPINESS.commuteGood) * k;
        }
        f.push({ label: v >= 0 ? 'Short commute' : 'Long commute', value: v });
      }
    }
    if (b.pop > 0) {
      f.push({
        label: b.shop >= 0.6 ? 'Shops nearby' : 'Few shops nearby',
        value: HAPPINESS.shopsGood * b.shop + HAPPINESS.shopsBad * (1 - b.shop),
      });
    }
    const lv = landValueAt(sim, b.x, b.z);
    f.push({ label: 'Neighbourhood', value: HAPPINESS.landValue * (lv - 0.35) * 2 });
  } else {
    const staffed = b.cap > 0 ? Math.min(1, b.pop / b.cap) : 0;
    f.push(
      staffed >= 0.9
        ? { label: 'Fully staffed', value: HAPPINESS.staffedGood }
        : { label: 'Not enough workers', value: HAPPINESS.workersBad * (1 - staffed) },
    );
    if (b.zone === ZONE_C) {
      const c = b.shop;
      const v =
        c >= 0.6 ? HAPPINESS.customersGood * Math.min(1, c / 0.9) : HAPPINESS.customersBad * (1 - c / 0.6);
      f.push({ label: c >= 0.6 ? 'Plenty of customers' : 'Too few customers', value: v });
    }
  }
  if (Math.abs(taxTerm) > 0.001)
    f.push({ label: taxTerm < 0 ? 'Taxes are high' : 'Taxes are low', value: taxTerm });
  return f.map((x) => ({ label: x.label, value: Math.round(x.value * 1000) / 1000 }));
}

export function computeHappiness(sim: Sim, b: Building): number {
  const sum = happinessFactors(sim, b).reduce((s, x) => s + x.value, 0);
  return Math.round(Math.max(0, Math.min(1, HAPPINESS.base + sum)) * 1000) / 1000;
}

export function updateHappiness(sim: Sim): void {
  for (const b of sim.state.buildings.values()) {
    if (b.state === BState.Active || (b.state === BState.Construction && b.pop > 0))
      b.happiness = computeHappiness(sim, b);
  }
}
