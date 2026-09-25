import { Sim } from '../src/sim/sim';
import type { RoadTypeId } from '../src/data/roads';
import type { Vec2 } from '../src/sim/geom';
import { rectsOverlap } from '../src/sim/geom';
import { ROWS } from '../src/data/zones';
import type { CommandOk, CommandResult } from '../src/sim/commands';

export function newSim(opts: Parameters<typeof Sim.create>[0] = {}): Sim {
  const sim = Sim.create({ seed: 'citybloom', preset: 'river', ...opts });
  sim.testMode = true;
  return sim;
}

export function connectPoint(sim: Sim): Vec2 {
  const n = sim.state.net.nodes.get(sim.state.highway.connect)!;
  return { x: n.x, z: n.z };
}

export function road(sim: Sim, points: Vec2[], type: RoadTypeId = 'street'): CommandOk {
  const r = sim.dispatch({ type: 'buildRoad', road: type, points });
  if (!r.ok) throw new Error(`road failed: ${r.reason} at ${JSON.stringify(r.at)}`);
  return r;
}

export function cellsOf(r: CommandResult): number {
  if (!r.ok) throw new Error(r.reason);
  return (r.info as { cells: number }).cells;
}

/** All valid cells as oriented rects, for overlap checks. */
export function validCells(sim: Sim) {
  const out: { block: number; idx: number; rect: ReturnType<Sim['net']['cellRect']> }[] = [];
  for (const b of sim.state.net.blocks.values()) {
    for (let i = 0; i < b.cols * ROWS; i++)
      if (b.valid[i]) out.push({ block: b.id, idx: i, rect: sim.net.cellRect(b.id, i) });
  }
  return out;
}

export function overlappingValidCells(sim: Sim): number {
  const cells = validCells(sim);
  let n = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i]!.rect;
      const b = cells[j]!.rect;
      if (Math.abs(a.x - b.x) > 12 || Math.abs(a.z - b.z) > 12) continue;
      if (rectsOverlap(a, b)) n++;
    }
  }
  return n;
}

export function nodeDegree(sim: Sim, id: number): number {
  return sim.net.segmentsAt(id).length;
}
