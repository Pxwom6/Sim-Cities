import { GARBAGE } from '../../data/civic';
import { ZONE_R } from '../../data/zones';
import type { Sim } from '../sim';
import { BState, type Building } from '../world/buildings';
import { civicDef, civicOnline, type Civic } from '../world/civic';
import { accrue } from './economy';
import { attachmentOf } from './commute';
import { Dijkstra } from './graph';
import { registerVehicleKind, route, sendHome, spawnVehicle, despawnVehicle } from './vehicles';

const dijkstra = new Dijkstra();

/** Garbage made per hour by a building. */
export function garbageRate(b: Building): number {
  if (b.state !== BState.Active || b.pop <= 0) return 0;
  return (b.zone === ZONE_R ? b.pop * GARBAGE.perResident : b.pop * GARBAGE.perJob[b.zone]!) / 24;
}

export function garbageHour(sim: Sim): void {
  for (const b of sim.state.buildings.values()) {
    const r = garbageRate(b);
    if (!r) continue;
    const before = b.garbage;
    b.garbage = Math.min(1000, Math.round((b.garbage + r) * 1000) / 1000);
    if (before < GARBAGE.visible !== b.garbage < GARBAGE.visible) sim.markBuildingDirty(b.id);
  }
}

function trucksFor(sim: Sim, c: Civic): number {
  const def = civicDef(c);
  if (!def.garbage) return 0;
  return Math.max(0, Math.round(def.garbage.trucks * sim.fundingEff('garbage')));
}

function full(c: Civic): boolean {
  const g = civicDef(c).garbage!;
  if (g.storage !== undefined) return c.stored >= g.storage;
  if (g.process !== undefined) return c.processedToday >= g.process;
  return false;
}

/** Hourly: each facility sends free trucks to the fullest reachable buildings. */
export function dispatchGarbage(sim: Sim): void {
  const s = sim.state;
  const g = sim.graph();
  const targeted = new Set<number>();
  for (const v of s.vehicles.values()) if (v.kind === 'garbage') targeted.add(v.target);
  const facilities = [...s.civics.values()]
    .filter((c) => civicDef(c).garbage && c.access && civicOnline(c))
    .sort((a, b) => a.id - b.id);
  for (const c of facilities) {
    let free = trucksFor(sim, c) - c.out;
    if (free <= 0 || full(c)) continue;
    const seg = s.net.segments.get(c.access!.seg);
    if (!seg) continue;
    const node = g.index.get(c.access!.s < sim.net.curve(seg.id).length / 2 ? seg.a : seg.b);
    if (node === undefined) continue;
    const reach = new Map<number, number>();
    dijkstra.run(g, [{ node, cost: 0 }], GARBAGE.range * 4, (u, cost) => {
      reach.set(u, cost);
      return true;
    });
    const cands: { b: Building; cost: number }[] = [];
    for (const b of s.buildings.values()) {
      if (b.garbage < 12 || targeted.has(b.id)) continue;
      const att = attachmentOf(sim, g, b);
      if (!att) continue;
      const cost = reach.get(att.node);
      if (cost === undefined) continue;
      cands.push({ b, cost });
    }
    cands.sort((a, b) => b.b.garbage - a.b.garbage || a.cost - b.cost || a.b.id - b.b.id);
    for (const cand of cands) {
      if (free <= 0) break;
      if (targeted.has(cand.b.id)) continue;
      const acc = sim.buildingAccess(cand.b);
      if (!acc) continue;
      const legs = route(sim, c.access!, acc);
      if (!legs) continue;
      spawnVehicle(sim, 'garbage', c.id, cand.b.id, legs);
      targeted.add(cand.b.id);
      // Neighbours the truck will also serve aren't targeted separately this round.
      for (const id of sim.bldHash.queryPoint(cand.b.x, cand.b.z, GARBAGE.pickupRadius)) targeted.add(id);
      free--;
    }
  }
}

/** Is a building within reach of a garbage facility that still has room? (for maps and mood) */
export function garbageCovered(sim: Sim): Set<number> {
  const s = sim.state;
  const g = sim.graph();
  const covered = new Set<number>();
  for (const c of s.civics.values()) {
    if (!civicDef(c).garbage || !c.access || full(c) || !civicOnline(c)) continue;
    const seg = s.net.segments.get(c.access.seg);
    if (!seg) continue;
    const node = g.index.get(c.access.s < sim.net.curve(seg.id).length / 2 ? seg.a : seg.b);
    if (node === undefined) continue;
    const reach = new Set<number>();
    dijkstra.run(g, [{ node, cost: 0 }], GARBAGE.range * 4, (u) => {
      reach.add(u);
      return true;
    });
    for (const b of s.buildings.values()) {
      const att = attachmentOf(sim, g, b);
      if (att && reach.has(att.node)) covered.add(b.id);
    }
  }
  return covered;
}

registerVehicleKind('garbage', {
  arrive(sim, v) {
    const s = sim.state;
    const home = s.civics.get(v.home);
    const cap = home ? civicDef(home).garbage!.truckCapacity : 0;
    const target = s.buildings.get(v.target);
    const near = target ? sim.bldHash.queryPoint(target.x, target.z, GARBAGE.pickupRadius) : [];
    const list = near
      .map((id) => s.buildings.get(id)!)
      .filter((b) => b && b.garbage > 0)
      .sort((a, b) =>
        a.id === v.target ? -1 : b.id === v.target ? 1 : b.garbage - a.garbage || a.id - b.id,
      );
    for (const b of list) {
      const take = Math.min(b.garbage, cap - v.load);
      if (take <= 0) break;
      const before = b.garbage;
      b.garbage = Math.round((b.garbage - take) * 1000) / 1000;
      v.load = Math.round((v.load + take) * 1000) / 1000;
      if (before >= GARBAGE.visible && b.garbage < GARBAGE.visible) sim.markBuildingDirty(b.id);
    }
    v.phase = 'work';
    v.wait = 12;
  },
  workDone(sim, v) {
    sendHome(sim, v);
  },
  home(sim, v) {
    const c = sim.state.civics.get(v.home);
    if (c) {
      const g = civicDef(c).garbage!;
      if (g.storage !== undefined) c.stored = Math.min(g.storage, c.stored + v.load);
      else {
        c.processedToday += v.load;
        if (g.revenuePerUnit) accrue(sim, 'trade', v.load * g.revenuePerUnit);
      }
    }
    despawnVehicle(sim, v);
  },
});
