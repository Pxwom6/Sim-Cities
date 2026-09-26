// Dev probe: how well garbage collection keeps up in a saved city (playtest fixes).
// Steps the city a tick at a time and reports, per day: garbage produced vs collected, the backlog
// on the streets, trucks out vs parked, and every truck trip split into driving out, loading and
// driving back, with the delay traffic added over free-flowing roads and the load carried.
// Usage: npx tsx scripts/dev/garbage.ts <save.citybloom> [days=6] [--move-landfill x,z]
//        npx tsx scripts/dev/garbage.ts --town [days=6] [--late N]  (the planned test town, served
//        but with no landfill for its first N days (default 4), then one at the edge of town)
import { readFileSync } from 'node:fs';
import { decodeSave } from '../../src/client/saves';
import { Sim } from '../../src/sim/sim';
import { ROAD_TYPES } from '../../src/data/roads';
import { GARBAGE, VEHICLE_SPEED_SCALE } from '../../src/data/civic';
import { civicDef } from '../../src/sim/world/civic';
import { garbageRate } from '../../src/sim/systems/garbage';
import { TICKS_PER_MONTH as TICKS_PER_DAY } from '../../src/sim/time';
import { roadsidePose } from '../../src/sim/world/civic';
import type { Leg } from '../../src/sim/systems/graph';
import { buildTown, newSim, serveTown } from '../../tests/helpers';

const args = process.argv.slice(2);
const file = args[0]!;
const days = Number((args[1] ?? '').startsWith('--') || args[1] === undefined ? 6 : args[1]);
const moveAt = args.includes('--move-landfill') ? args[args.indexOf('--move-landfill') + 1]! : null;

let sim: Sim;
if (file === '--town') {
  // The planned town (tests/helpers), served; its landfill (on the utility street at the edge of
  // town) is taken away and put back after `late` days, as a player who builds it late would.
  const late = args.includes('--late') ? Number(args[args.indexOf('--late') + 1]) : 4;
  sim = newSim();
  buildTown(sim);
  serveTown(sim);
  const lf = [...sim.state.civics.values()].find((c) => c.def === 'landfill')!;
  const pose = { x: lf.x, z: lf.z, angle: lf.angle, side: lf.side };
  sim.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: lf.id } });
  console.log('day  backlog  piles  biggest pile  (no landfill)');
  for (let d = 0; d < late; d++) {
    sim.advance(TICKS_PER_DAY);
    const bl = [...sim.state.buildings.values()];
    console.log(
      `${String(d + 1).padStart(3)} ${Math.round(bl.reduce((t, b) => t + b.garbage, 0))
        .toLocaleString('en-US')
        .padStart(
          8,
        )} ${String(bl.filter((b) => b.garbage >= GARBAGE.visible).length).padStart(6)} ${Math.round(
        Math.max(...bl.map((b) => b.garbage)),
      )
        .toString()
        .padStart(13)}`,
    );
  }
  sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 20_000 });
  const r = sim.dispatch({ type: 'placeBuilding', def: 'landfill', ...pose });
  if (!r.ok) throw new Error(`landfill: ${r.reason}`);
} else sim = Sim.fromSave(decodeSave(readFileSync(file)));
const s = sim.state;
const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const facilities = () => [...s.civics.values()].filter((c) => civicDef(c).garbage);

// Where things are: the town's centre of population and each facility's distance from it.
let cx = 0;
let cz = 0;
let n = 0;
for (const b of s.buildings.values())
  if (b.pop > 0) {
    cx += b.x * b.pop;
    cz += b.z * b.pop;
    n += b.pop;
  }
cx /= n;
cz /= n;
const radius = Math.max(...[...s.buildings.values()].map((b) => Math.hypot(b.x - cx, b.z - cz)));
console.log(
  `${s.cityName}: pop ${s.totals.population}, day ${Math.floor(s.tick / TICKS_PER_DAY)}, $${fmt(s.treasury)}, garbage funding ${s.economy.funding.garbage}%, town radius ${fmt(radius)} m, centre ${fmt(cx)},${fmt(cz)}`,
);

if (moveAt) {
  // Experiment: move the landfill to (x, z) (bulldoze, then place beside the nearest road).
  const [mx, mz] = moveAt.split(',').map(Number) as [number, number];
  const lf = facilities()[0]!;
  const stored = lf.stored;
  sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 50_000 });
  sim.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: lf.id } });
  const def = civicDef(lf);
  const segs = [...s.net.segments.values()]
    .filter((x) => x.type !== 'highway')
    .map((x) => ({ x, p: sim.net.curve(x.id).pointAt(sim.net.curve(x.id).length / 2) }))
    .sort((a, b) => Math.hypot(a.p.x - mx, a.p.z - mz) - Math.hypot(b.p.x - mx, b.p.z - mz));
  let placed = false;
  for (const { x } of segs) {
    const len = sim.net.curve(x.id).length;
    for (let at = def.w / 2 + 10; at < len - def.w / 2 - 10 && !placed; at += 8)
      for (const side of [1, -1] as const) {
        const r = sim.dispatch({
          type: 'placeBuilding',
          def: def.id,
          ...roadsidePose(sim.net, x.id, at, side, def.d),
        });
        if (r.ok) {
          s.civics.get(r.created![0]!)!.stored = stored;
          placed = true;
          break;
        }
      }
    if (placed) break;
  }
  console.log(`moved the landfill toward ${mx},${mz}: ${placed ? 'ok' : 'FAILED'}`);
}

for (const c of facilities()) {
  const g = civicDef(c).garbage!;
  console.log(
    `  ${c.def} #${c.id} at ${fmt(c.x)},${fmt(c.z)}: ${fmt(Math.hypot(c.x - cx, c.z - cz))} m from the centre; trucks ${g.trucks}×${g.truckCapacity}, stored ${fmt(c.stored)}`,
  );
}

/** Free-flow ticks to drive a route (no traffic). */
const freeTicks = (legs: Leg[]) =>
  legs.reduce((t, l) => {
    const seg = s.net.segments.get(l.seg);
    const v = seg ? ROAD_TYPES[seg.type].speed / 3.6 : 10;
    return t + Math.abs(l.s1 - l.s0) / (VEHICLE_SPEED_SCALE * v);
  }, 0);
const metres = (legs: Leg[]) => legs.reduce((t, l) => t + Math.abs(l.s1 - l.s0), 0);

interface Trip {
  start: number;
  outFree: number;
  outM: number;
  arrive?: number;
  back?: number;
  backFree?: number;
  backM?: number;
  end?: number;
  load: number;
}
const trips = new Map<number, Trip>();
const done: Trip[] = [];
const backlog = () => [...s.buildings.values()].reduce((t, b) => t + b.garbage, 0);
const piles = () => [...s.buildings.values()].filter((b) => b.garbage >= GARBAGE.visible).length;
const stock = () => facilities().reduce((t, c) => t + c.stored + c.processedToday, 0);

console.log('\nday  produced  collected   backlog  piles  trucks out/parked  trips  avg load');
for (let d = 0; d < days; d++) {
  let produced = 0;
  let collected = 0;
  let outSum = 0;
  let parkedSum = 0;
  let tripsDone = 0;
  let loadSum = 0;
  for (let k = 0; k < TICKS_PER_DAY; k++) {
    const before = stock();
    if (s.tick % 60 === 0) for (const b of s.buildings.values()) produced += garbageRate(sim, b);
    sim.advance(1);
    const now = s.tick;
    // Processed-today counters reset at midnight; count deliveries as stock rises.
    collected += Math.max(0, stock() - before);
    let out = 0;
    const live = new Set<number>();
    for (const v of s.vehicles.values()) {
      if (v.kind !== 'garbage') continue;
      out++;
      live.add(v.id);
      let t = trips.get(v.id);
      if (!t)
        trips.set(v.id, (t = { start: now - 1, outFree: freeTicks(v.legs), outM: metres(v.legs), load: 0 }));
      if (v.phase === 'work' && t.arrive === undefined) t.arrive = now;
      if (v.phase === 'back' && t.back === undefined) {
        t.back = now;
        t.backFree = freeTicks(v.legs);
        t.backM = metres(v.legs);
      }
      t.load = v.load;
    }
    for (const [id, t] of trips)
      if (!live.has(id)) {
        t.end = now;
        done.push(t);
        trips.delete(id);
        tripsDone++;
        loadSum += t.load;
      }
    const total = facilities().reduce(
      (a, c) => a + Math.round(civicDef(c).garbage!.trucks * sim.fundingEff('garbage')),
      0,
    );
    outSum += out;
    parkedSum += Math.max(0, total - out);
  }
  console.log(
    `${String(d + 1).padStart(3)} ${fmt(produced).padStart(9)} ${fmt(collected).padStart(10)} ${fmt(backlog()).padStart(9)} ${String(piles()).padStart(6)}   ${fmt(outSum / TICKS_PER_DAY, 1).padStart(6)} / ${fmt(parkedSum / TICKS_PER_DAY, 1).padEnd(6)}     ${String(tripsDone).padStart(5)} ${fmt(tripsDone ? loadSum / tripsDone : 0).padStart(9)}`,
  );
}

const full = done.filter((t) => t.arrive !== undefined && t.back !== undefined && t.end !== undefined);
if (full.length) {
  const avg = (f: (t: Trip) => number) => full.reduce((a, t) => a + f(t), 0) / full.length;
  const outT = avg((t) => t.arrive! - t.start);
  const work = avg((t) => t.back! - t.arrive!);
  const backT = avg((t) => t.end! - t.back!);
  const outFree = avg((t) => t.outFree);
  const backFree = avg((t) => t.backFree!);
  console.log(
    `\ntrips: ${full.length}, average ${fmt(outT + work + backT)} min (${fmt((outT + work + backT) / 60, 1)} h): ` +
      `driving out ${fmt(outT)} (free-flow ${fmt(outFree)}, ${fmt(avg((t) => t.outM))} m), collecting (stops and the drives between them) ${fmt(work)}, ` +
      `driving back ${fmt(backT)} (free-flow ${fmt(backFree)}, ${fmt(avg((t) => t.backM!))} m); ` +
      `traffic adds ${fmt(outT + backT - outFree - backFree)} min; average load ${fmt(avg((t) => t.load))} of 400`,
  );
}
