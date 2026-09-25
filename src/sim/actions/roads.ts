import { ROAD_RULES, ROAD_TYPES, roadHalfWidth, type RoadTypeId } from '../../data/roads';
import { GRID_CELL, GRID_RES } from '../../data/world';
import { fail, ok, type BulldozeTarget, type CommandResult } from '../commands';
import { Curve, pointRectDistance, type Vec2 } from '../geom';
import { footprint } from '../world/buildings';
import { bulldozeCivic, civicRect } from '../world/civic';
import type { Sim } from '../sim';
import { UNDO_LIMIT } from '../undo';
import { applyRoadPlan, planRoad } from '../world/roadPlanner';
import { removeStop } from '../systems/transit';

/** Refusal reason if a road type isn't available yet, else null. */
function roadLocked(sim: Sim, road: RoadTypeId): string | null {
  const t = ROAD_TYPES[road];
  if (!t.buildable) return "That road type can't be built";
  if (!sim.isUnlocked(t.unlockPopulation))
    return `${t.name}s unlock at ${t.unlockPopulation.toLocaleString('en-US')} residents`;
  return null;
}

export function buildRoad(sim: Sim, road: RoadTypeId, points: Vec2[], dryRun: boolean): CommandResult {
  const s = sim.state;
  const locked = roadLocked(sim, road);
  if (locked) return fail(locked);
  const plan = planRoad(sim.net, sim.terrain, road, points, s.treasury, s.options.sandbox);
  const preview = {
    pieces: plan.pieces.map((p) => ({ a: p.a, c: p.c, b: p.b })),
    length: plan.length,
    splits: plan.splits.length,
    demolish: plan.ok ? buildingsInTheWay(sim, plan.pieces, road).length : 0,
  };
  if (!plan.ok) return fail(plan.reason ?? 'Invalid road', { at: plan.at, info: preview });
  if (dryRun) return ok(plan.cost, { info: preview });
  const res = applyRoadPlan(sim.net, plan);
  sim.spend(plan.cost, 'roads');
  clearTreesAlong(sim, res.segments);
  sim.pushUndo({
    kind: 'road',
    tick: s.tick,
    cost: plan.cost,
    segments: res.segments,
    nodes: res.nodes,
    splits: res.splits,
  });
  sim.markNetworkChanged();
  return ok(plan.cost, { created: res.segments, info: preview });
}

/**
 * Change a road to another type in place (SPEC: upgrading keeps what's built along it wherever
 * possible). Zone cells keep their indices and slide outward or inward with the new width;
 * buildings move with them and are only lost where the wider road leaves no room.
 */
export function upgradeRoad(sim: Sim, segId: number, road: RoadTypeId, dryRun: boolean): CommandResult {
  const s = sim.state;
  const seg = s.net.segments.get(segId);
  if (!seg) return fail('No road here');
  if (!ROAD_TYPES[seg.type].buildable) return fail("The regional highway can't be changed");
  if (seg.type === road) return fail(`This is already ${articled(ROAD_TYPES[road].name)}`);
  const locked = roadLocked(sim, road);
  if (locked) return fail(locked);
  const curve = sim.net.curve(segId);
  const len = curve.length;
  const cost = Math.max(
    0,
    Math.round(len * (ROAD_TYPES[road].costPerMetre - ROAD_TYPES[seg.type].costPerMetre)),
  );
  const at = curve.pointAt(len / 2);
  if (cost > s.treasury && !s.options.sandbox) return fail('Not enough money', { at });
  // Room for the new width: other roads (not joined at the ends) and civic buildings.
  const hwNew = roadHalfWidth(road);
  const pts: Vec2[] = [];
  for (let d = 6; d < len - 6; d += 4) pts.push(curve.pointAt(d));
  const box = curve.bbox(hwNew + 40);
  for (const other of sim.net.segHash.query(box).sort((x, y) => x - y)) {
    if (other === segId) continue;
    const o = sim.net.segment(other);
    if (o.a === seg.a || o.a === seg.b || o.b === seg.a || o.b === seg.b) continue;
    const oc = sim.net.curve(other);
    const need = hwNew + sim.net.halfWidth(other) - 0.5;
    for (const p of pts) if (oc.project(p).d < need) return fail('Not enough room to widen here', { at: p });
  }
  for (const c of s.civics.values()) {
    const r = civicRect(c, 0.3);
    for (const p of pts)
      if (pointRectDistance(p, r) < hwNew) return fail('A civic building is in the way', { at: p });
  }
  const info = { length: Math.round(len), from: seg.type, to: road };
  if (dryRun) return ok(cost, { info });
  const from = seg.type;
  sim.net.setSegmentType(segId, road);
  sim.relocateBuildingsOn(segId);
  sim.net.revalidate(sim.net.segmentInfluenceBox(segId));
  sim.spend(cost, 'roads');
  clearTreesAlong(sim, [segId]);
  sim.pushUndo({ kind: 'upgrade', tick: s.tick, cost, seg: segId, from });
  sim.markNetworkChanged();
  return ok(cost, { info });
}

export function undoUpgrade(
  sim: Sim,
  rec: Extract<import('../undo').UndoRecord, { kind: 'upgrade' }>,
  dryRun: boolean,
): CommandResult {
  if (!sim.state.net.segments.has(rec.seg)) return fail("Can't undo: that road has changed since");
  if (dryRun) return ok(-rec.cost);
  sim.net.setSegmentType(rec.seg, rec.from);
  sim.relocateBuildingsOn(rec.seg);
  sim.net.revalidate(sim.net.segmentInfluenceBox(rec.seg));
  sim.earn(rec.cost, 'refunds');
  sim.markNetworkChanged();
  return ok(-rec.cost);
}

function articled(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name.toLowerCase()}` : `a ${name.toLowerCase()}`;
}

export function bulldoze(sim: Sim, target: BulldozeTarget, dryRun: boolean): CommandResult {
  if (target.kind === 'segment') {
    const seg = sim.state.net.segments.get(target.id);
    if (!seg) return fail('Nothing to bulldoze');
    if (!ROAD_TYPES[seg.type].buildable) return fail("The regional highway can't be bulldozed");
    const len = sim.net.curve(seg.id).length;
    const refund = Math.round(len * ROAD_TYPES[seg.type].costPerMetre * ROAD_RULES.bulldozeRefund);
    const buildings = new Set<number>();
    for (const bid of [seg.left, seg.right]) {
      const b = bid ? sim.state.net.blocks.get(bid) : undefined;
      if (b) for (const x of b.bld) if (x) buildings.add(x);
    }
    const info = { refund, buildings: [...buildings].sort((a, b) => a - b) };
    if (dryRun) return ok(-refund, { info });
    const box = sim.net.segmentInfluenceBox(seg.id);
    const { a, b } = seg;
    sim.net.removeSegment(seg.id);
    sim.net.removeNodeIfOrphan(a);
    sim.net.removeNodeIfOrphan(b);
    sim.net.revalidate(box);
    sim.earn(refund, 'refunds');
    sim.markNetworkChanged();
    return ok(-refund, { info });
  }
  if (target.kind === 'civic') return bulldozeCivic(sim, target.id, dryRun);
  if (target.kind === 'stop') return removeStop(sim, target.id, dryRun);
  if (target.kind === 'building') {
    const b = sim.state.buildings.get(target.id);
    if (!b) return fail('Nothing to bulldoze');
    if (dryRun) return ok(0, { info: { refund: 0, buildings: [b.id] } });
    sim.removeBuilding(b.id);
    return ok(0, { info: { refund: 0, buildings: [b.id] } });
  }
  return fail('Nothing to bulldoze');
}

/** Buildings whose footprints a planned road would run through (they get demolished). */
export function buildingsInTheWay(
  sim: Sim,
  pieces: { a: Vec2; c: Vec2; b: Vec2 }[],
  type: RoadTypeId,
): number[] {
  const hw = roadHalfWidth(type);
  const out = new Set<number>();
  for (const p of pieces) {
    const curve = new Curve(p.a, p.c, p.b, 2);
    const box = curve.bbox(hw + 40);
    for (const id of sim.bldHash.query(box)) {
      const b = sim.state.buildings.get(id)!;
      const r = footprint(b, 0.5);
      for (let i = 0; i < curve.xs.length; i++) {
        if (pointRectDistance({ x: curve.xs[i]!, z: curve.zs[i]! }, r) < hw) {
          out.add(id);
          break;
        }
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Thin the tree-density grid under new roads (the renderer also hides individual trees). */
export function clearTreesAlong(sim: Sim, segments: number[]): void {
  const trees = sim.state.trees;
  for (const id of segments) {
    const curve = sim.net.curve(id);
    const hw = roadHalfWidth(sim.net.segment(id).type) + 1;
    const box = curve.bbox(hw);
    const i0 = Math.max(0, Math.floor(box.minX / GRID_CELL));
    const i1 = Math.min(GRID_RES - 1, Math.floor(box.maxX / GRID_CELL));
    const j0 = Math.max(0, Math.floor(box.minZ / GRID_CELL));
    const j1 = Math.min(GRID_RES - 1, Math.floor(box.maxZ / GRID_CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * GRID_RES + i;
        if (!trees[k]) continue;
        let hit = 0;
        for (let u = 0; u < 4; u++) {
          for (let v = 0; v < 4; v++) {
            const p = { x: (i + (u + 0.5) / 4) * GRID_CELL, z: (j + (v + 0.5) / 4) * GRID_CELL };
            if (curve.project(p).d <= hw) hit++;
          }
        }
        if (!hit) continue;
        const next = Math.round(trees[k]! * (1 - hit / 16));
        if (next !== trees[k]) {
          trees[k] = next;
          sim.markTreesDirty(k);
        }
      }
    }
  }
}

export function undoRoad(
  sim: Sim,
  rec: Extract<import('../undo').UndoRecord, { kind: 'road' }>,
  dryRun: boolean,
): CommandResult {
  for (const id of rec.segments)
    if (!sim.state.net.segments.has(id)) return fail("Can't undo: that road has changed since");
  if (dryRun) return ok(-rec.cost);
  let box: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null;
  const grow = (b: typeof box) => {
    if (!b) return;
    box = box
      ? {
          minX: Math.min(box.minX, b.minX),
          minZ: Math.min(box.minZ, b.minZ),
          maxX: Math.max(box.maxX, b.maxX),
          maxZ: Math.max(box.maxZ, b.maxZ),
        }
      : b;
  };
  for (const id of rec.segments) {
    grow(sim.net.segmentInfluenceBox(id));
    const seg = sim.net.segment(id);
    sim.net.removeSegment(id);
    sim.net.removeNodeIfOrphan(seg.a);
    sim.net.removeNodeIfOrphan(seg.b);
  }
  for (const sp of [...rec.splits].reverse()) {
    if (sim.state.net.segments.has(sp.first)) grow(sim.net.segmentInfluenceBox(sp.first));
    if (sim.state.net.segments.has(sp.second)) grow(sim.net.segmentInfluenceBox(sp.second));
    sim.net.mergeSplit(sp);
  }
  for (const n of rec.nodes) sim.net.removeNodeIfOrphan(n);
  if (box) sim.net.revalidate(box);
  sim.earn(rec.cost, 'refunds');
  sim.markNetworkChanged();
  return ok(-rec.cost);
}

export { UNDO_LIMIT };
