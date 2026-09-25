import { Sim } from '../src/sim/sim';
import type { RoadTypeId } from '../src/data/roads';
import type { Vec2 } from '../src/sim/geom';
import { rectsOverlap } from '../src/sim/geom';
import { ROWS } from '../src/data/zones';
import type { CommandOk, CommandResult } from '../src/sim/commands';
import { CIVIC } from '../src/data/civic';
import { roadsidePose as roadsidePoseNet } from '../src/sim/world/civic';

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

/**
 * A small planned town off the highway: an avenue east with crossing side streets, residential
 * north, commercial along the avenue, industry to the south-east. Returns the segments built.
 */
export function buildTown(
  sim: Sim,
  opts: { length?: number; streets?: number; zone?: boolean } = {},
): { avenue: number[]; streets: number[] } {
  const c = connectPoint(sim);
  const len = opts.length ?? 480;
  const streets = opts.streets ?? 4;
  const avenue = road(sim, [c, { x: c.x + len, z: c.z }], 'avenue').created!;
  const side: number[] = [];
  for (let k = 1; k <= streets; k++) {
    const x = c.x + (len * k) / (streets + 1);
    side.push(
      ...road(
        sim,
        [
          { x, z: c.z - 160 },
          { x, z: c.z + 160 },
        ],
        'street',
      ).created!,
    );
  }
  if (opts.zone !== false) {
    // Residential north of the avenue, commercial hugging it, industry south-east.
    sim.dispatch({
      type: 'zone',
      zone: 'R',
      area: {
        kind: 'brush',
        points: [
          { x: c.x + 20, z: c.z - 100 },
          { x: c.x + len, z: c.z - 100 },
        ],
        radius: 70,
      },
    });
    sim.dispatch({
      type: 'zone',
      zone: 'C',
      area: {
        kind: 'brush',
        points: [
          { x: c.x + 20, z: c.z + 20 },
          { x: c.x + len, z: c.z + 20 },
        ],
        radius: 22,
      },
    });
    sim.dispatch({
      type: 'zone',
      zone: 'R',
      area: {
        kind: 'brush',
        points: [
          { x: c.x + 20, z: c.z + 90 },
          { x: c.x + len / 2, z: c.z + 90 },
        ],
        radius: 50,
      },
    });
    sim.dispatch({
      type: 'zone',
      zone: 'I',
      area: {
        kind: 'brush',
        points: [
          { x: c.x + len / 2 + 20, z: c.z + 110 },
          { x: c.x + len, z: c.z + 110 },
        ],
        radius: 50,
      },
    });
  }
  const all = [...sim.state.net.segments.values()].map((s) => s.id);
  return {
    avenue: all.filter((id) => avenue.includes(id) || sim.state.net.segments.get(id)!.type === 'avenue'),
    streets: side,
  };
}

export function countBuildings(
  sim: Sim,
  pred: (b: Sim['state']['buildings'] extends Map<number, infer B> ? B : never) => boolean = () => true,
): number {
  let n = 0;
  for (const b of sim.state.buildings.values()) if (pred(b)) n++;
  return n;
}

export function roadsidePose(sim: Sim, segId: number, s: number, side: 1 | -1, d: number) {
  return roadsidePoseNet(sim.net, segId, s, side, d);
}

/** Place a civic building somewhere along a segment (tries positions and both sides). */
export function placeAlong(sim: Sim, def: string, segId: number): number {
  const d = CIVIC.get(def)!;
  const len = sim.net.curve(segId).length;
  for (let s = d.w / 2 + 12; s < len - d.w / 2 - 12; s += 6) {
    for (const side of [1, -1] as const) {
      const pose = roadsidePose(sim, segId, s, side, d.d);
      const r = sim.dispatch({ type: 'placeBuilding', def, ...pose });
      if (r.ok) return r.created![0]!;
    }
  }
  throw new Error(`could not place ${def} along segment ${segId}`);
}

/**
 * A utility street west–east south of the town: coal power, groundwater pumps, a sewage
 * treatment plant and a landfill (unlock thresholds lifted with the debug cheat).
 */
export function serveTown(sim: Sim, services = true): { street: number; civics: number[] } {
  sim.dispatch({ type: 'cheat', cheat: 'unlockAll' });
  sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: services ? 140_000 : 80_000 });
  const c = connectPoint(sim);
  let pts: Vec2[] | null = null;
  for (const dz of [230, 250, 270, 210, 290]) {
    const cand = [
      { x: c.x + 30, z: c.z + dz },
      { x: c.x + 470, z: c.z + dz },
    ];
    if (sim.preview({ type: 'buildRoad', road: 'street', points: cand }).ok) {
      pts = cand;
      break;
    }
  }
  if (!pts) throw new Error('no room for the utility street');
  const r = road(sim, pts, 'street');
  // Link it to the town through the side streets that end at z+160.
  for (const seg of [...sim.state.net.segments.values()]) {
    if (seg.type !== 'street') continue;
    const na = sim.state.net.nodes.get(seg.a)!;
    const nb = sim.state.net.nodes.get(seg.b)!;
    for (const n of [na, nb]) {
      if (Math.abs(n.z - (c.z + 160)) < 1 && sim.net.segmentsAt(n.id).length === 1) {
        sim.dispatch({
          type: 'buildRoad',
          road: 'street',
          points: [
            { x: n.x, z: n.z },
            { x: n.x, z: pts[0]!.z },
          ],
        });
      }
    }
  }
  const streetSegs = [...sim.state.net.segments.values()].filter(
    (s) => Math.abs(sim.net.curve(s.id).pointAt(sim.net.curve(s.id).length / 2).z - pts![0]!.z) < 1,
  );
  const civics: number[] = [];
  const order = ['coal', 'pump', 'pump', 'treatment', 'landfill', 'pump'];
  if (services) order.push('firestation', 'police', 'clinic', 'primary', 'park_small');
  // Prefer the utility street; fall back to any road in town.
  const others = [...sim.state.net.segments.values()].filter(
    (s) => !streetSegs.includes(s) && s.type !== 'highway',
  );
  for (const def of order) {
    let placed = false;
    for (const seg of [...streetSegs, ...others]) {
      try {
        civics.push(placeAlong(sim, def, seg.id));
        placed = true;
        break;
      } catch {
        /* try the next piece of the street */
      }
    }
    if (!placed) throw new Error(`could not place ${def}`);
  }
  return { street: r.created![0]!, civics };
}
