import { ROAD_RULES, ROAD_TYPES, roadHalfWidth, type RoadTypeId } from '../../data/roads';
import { GRID_CELL, GRID_RES } from '../../data/world';
import { fail, ok, type BulldozeTarget, type CommandResult } from '../commands';
import type { Vec2 } from '../geom';
import type { Sim } from '../sim';
import { UNDO_LIMIT } from '../undo';
import { applyRoadPlan, planRoad } from '../world/roadPlanner';

export function buildRoad(sim: Sim, road: RoadTypeId, points: Vec2[], dryRun: boolean): CommandResult {
  const s = sim.state;
  const plan = planRoad(sim.net, sim.terrain, road, points, s.treasury, s.options.sandbox);
  const preview = {
    pieces: plan.pieces.map((p) => ({ a: p.a, c: p.c, b: p.b })),
    length: plan.length,
    splits: plan.splits.length,
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
  return fail('Nothing to bulldoze');
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
