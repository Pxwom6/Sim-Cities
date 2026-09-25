# DESIGN.md — technical design

Working title: **Citybloom** (single constant `GAME_TITLE` in `src/config.ts`).

This document is the technical design: architecture, data model and simulation model. `SPEC.md` is the
brief; this file says *how* we build it. Every number quoted here is an initial value that lives in
typed config under `src/data/` and gets tuned by the balance tool in M12. Keep this file in step with
the code.

---

## 1. Architecture

### 1.1 Component diagram

```
┌─────────────────────────────────── Main thread ───────────────────────────────────┐
│                                                                                   │
│  DOM input ──► InputRouter ──► Tools (road / zone / bulldoze / place / inspect)   │
│      │                            │  ghost preview (local)   │ commands, previews │
│      ▼                            ▼                          ▼                    │
│  CameraController          UI (Preact + CSS tokens)     SimClient                 │
│  (eased pan/rotate/zoom)   top bar, toolbar, panels,    typed postMessage wrapper │
│      │                     debug panel, menus, advisors   │ request/reply ids     │
│      ▼                            ▲ read                  │ applies Frame diffs   │
│  Renderer (Three.js, WebGL2) ◄────┴──── ClientWorld ◄─────┘                       │
│  terrain chunks, water, sky,           read-only mirror: roads, zone blocks,      │
│  trees (instanced), roads (per-segment  buildings, stats, time, vehicles,         │
│  meshes), buildings (chunk-merged),     traffic flows, overlay grids              │
│  vehicles (instanced), overlays, FX                                               │
│                                                                                   │
│  window.__game (dev/test): dispatch, getState, advance, setCamera                 │
└──────────────────────────────────────┬──────────────────▲─────────────────────────┘
                     Command / Query /  │                  │  Frame {tick, diff, stats}
                     Speed / Advance    ▼                  │  Reply {id, result}
┌──────────────────────────────────── Web Worker ─────────┴─────────────────────────┐
│  worker.ts  — real-time loop: ticksDue = speed × elapsed (capped), batches ticks, │
│               flushes one Frame per loop iteration (≤ 20 Hz)                     │
│     └─► Sim  (src/sim — pure TypeScript, no DOM / Three.js)                        │
│          ├─ CommandProcessor: validate → apply → ledger → undo stack → cmd log   │
│          ├─ World: terrain grids, road graph, zone blocks, buildings, vehicles    │
│          ├─ Systems (fixed schedule, see §3.2):                                   │
│          │    demand · growth · economy · utilities · coverage · traffic ·        │
│          │    incidents/dispatch · happiness · land value · pollution ·           │
│          │    health/education · disasters · progression · advisors               │
│          ├─ RNG streams (sfc32, seeded, saved)      Calendar (tick → date/time)   │
│          ├─ DiffTracker (dirty ids per collection → compact Frame diffs)          │
│          └─ Save/Load (versioned JSON + migrations) · stateHash (FNV-1a)          │
└───────────────────────────────────────────────────────────────────────────────────┘
      src/data (typed balancing config) is imported by both sides.
      Tests (Vitest) drive Sim synchronously and headlessly — no worker needed.
```

### 1.2 Module layout

```
src/config.ts         title, version, feature flags
src/data/             typed config: roads, zones, buildings, services, utilities, economy,
                      balance (demand/growth/happiness constants), unlocks, policies, names
src/sim/              pure simulation (runs in the worker and in Vitest)
  sim.ts              Sim class: create/load, dispatch, step, query, save, hash, diffs
  worker.ts           worker entry (the only sim file that touches `self`)
  protocol.ts         typed messages between threads
  commands.ts         Command union + result types
  rng.ts hash.ts time.ts geom.ts spatial.ts
  terrain/            noise + deterministic terrain/resource/tree generation
  world/              roads (graph, planning, splitting), zones (blocks/cells), buildings, lots
  systems/            one file per system
  save.ts             serialize / deserialize / migrations
  invariants.ts       per-tick checks used in test mode
src/client/           SimClient, ClientWorld mirror, test API
src/render/           Three.js scene, camera, terrain, water, sky, trees, roads, zones,
                      buildings (asset registry + procedural parts), vehicles, overlays, FX
src/tools/            input tools (road, zone, bulldoze, place, inspect)
src/ui/               Preact components + CSS (tokens.css holds every design token)
src/audio/            procedural Web Audio
tests/                Vitest unit + scenario tests      e2e/  Playwright tests
scripts/              bench + balance runners (Node, headless Sim)
docs/                 DECISIONS.md, screenshots/
```

### 1.3 Trade-offs weighed

| Decision | Chosen | Alternatives and why not |
|---|---|---|
| Where the sim runs | **Web Worker**, same `Sim` class runs synchronously in tests/scripts | Main thread: simpler API but sim spikes become frame hitches. Worker cost: async API, a mirrored copy of render-relevant state, one round trip for previews. |
| Main-thread state | **ClientWorld mirror** of render-relevant fields, updated by diffs | Full snapshots each tick: too big at 5k buildings. SharedArrayBuffer: needs COOP/COEP headers and makes entity data awkward. |
| Diff shape | Per-collection upserts + removals of dirty ids, stats every frame, grids on demand as transferable `Float32Array`s | Field-level patches: more bookkeeping for little gain. |
| Entity storage | Plain objects in `Map<id, T>` with monotonically increasing ids (insertion order = id order ⇒ deterministic iteration, JSON-friendly) | Struct-of-arrays: faster but much harder to read and serialize. Used only for grids and zone cells. |
| Grids | 128×128 rasters of 16 m cells (`Float32Array`/`Uint8Array`) | Per-building only: can't express drift/diffusion or data maps. |
| Road geometry | Nodes + segments, each a **quadratic Bézier** (straight = control at midpoint), sampled to polylines for everything geometric | Cubic/arbitrary splines: more UI complexity for little visual gain; free-form drawing is fitted with chains of quadratics. |
| Zoning | Cells (8 m) generated along both sides of each segment in **zone blocks**, remapped geometrically when roads split or upgrade | A global grid: breaks with curved roads. |
| Traffic | **Aggregated assignment** (nearest-capacity trip distribution + congestion via BPR, averaged over rounds), visible cars sampled from real routes | Per-agent pathfinding: does not scale to 100k residents in JS. |
| Utilities | Flow through the **road network** by distance from plants; capacity-limited | Pipes/lines: spec says no. |
| Coverage | Bounded Dijkstra over the road graph in travel time, including congestion | Radius: spec forbids. |
| Buildings on screen | **Chunk-merged geometry** (128 m chunks, one draw call per chunk) with a shared vertex-coloured material; constructing/burning buildings drawn separately | Instancing per model: procedural variety creates hundreds of models, so instancing degrades to many draw calls. Instancing *is* used for trees, vehicles, zone cells, props. |
| UI framework | **Preact** (3 kB, JSX, hooks) + plain CSS with custom-property tokens | Vanilla DOM: panels (budget, inspector, menus) get messy. React: heavier. |
| Determinism | Integer tick, seeded sfc32 streams, no wall-clock or `Math.random` in `src/sim` (lint-enforced), money in integer dollars | Floats for money would make "income − expenses = Δtreasury, exactly" fragile. |
| Undo | Sim keeps an undo record per placement (created ids, painted cells, cost) and a single `undo` command reverses the latest one with a full refund | Snapshot-based undo: too much memory. Bulldozing is not undoable (spec: undo reverses placements). |

### 1.4 Threads and messages

Main → worker (`protocol.ts`): `init {seed, options} | load {save}`, `command {id, cmd}`, `preview {id, cmd}`
(dry run: validity, cost, affected entities; never mutates), `query {id, q}` (inspect building, overlay grid,
coverage preview, full state summary), `setSpeed {speed}`, `advance {id, ticks}` (run N ticks now, then
reply), `save {id}`.

Worker → main: `ready {snapshot}`, `frame {tick, diff, stats, perf}`, `reply {id, result}`.

The worker loop runs every ~16 ms: `due += elapsedMs × ticksPerSecond(speed)`, runs `min(floor(due), cap)`
ticks (cap prevents spiral-of-death; excess is dropped and reported in perf stats), then posts one frame
if anything changed. Commands are applied at the next tick boundary and logged as `{tick, cmd}`, so a
replay of the log from the same seed reproduces the same state hash.

### 1.5 Determinism rules

- All randomness from `Rng` streams (sfc32) seeded from the map seed; stream states are saved.
- Fixed tick; systems run on `tick % period === offset`; sliced work keeps its cursor in saved state.
- Iteration over entity maps is in id order. No `Date`, `performance`, `Math.random` inside `src/sim`
  (ESLint `no-restricted-globals`/`no-restricted-properties`).
- `stateHash()` = FNV-1a over the canonical save JSON. Tests assert: same seed + same command log ⇒
  same hash; save → load ⇒ same hash; load then run N ticks ⇒ same hash as running N ticks directly.

---

## 2. Data model

### 2.1 World coordinates

Metres. `x` east, `z` south, `y` up. Buildable area `[0, 2048] × [0, 2048]`. Water level `y = 0`.
Terrain grid: 257×257 heights at 8 m (bilinear sampling). Rasters: 128×128 cells of 16 m.
Scenery extends 3 km beyond each edge, generated on the main thread from the same pure height function.

### 2.2 Sim state (saved)

```ts
SimState {
  version, seed, options {preset, difficulty, sandbox, disasters}, tick,
  rng: {growth, events, traffic, world, disasters}          // sfc32 states
  terrain: { heights: Float32Array(257²) }                  // regenerated from seed, not saved
  grids:   { trees, groundwater, ore, oil,                  // Uint8/Float32, 128²
             airPollution, groundPollution, landValue, crime, garbageField, ... }
  roads:   { nodes: Map<id, RoadNode>, segments: Map<id, RoadSegment>, nextId }
  zones:   { blocks: Map<id, ZoneBlock> }
  buildings: Map<id, Building>
  vehicles:  Map<id, ServiceVehicle>                        // dispatched fire/police/ambulance/garbage/bus
  incidents: Map<id, Incident>                              // fires, crimes, emergencies, disasters
  traffic:   { segmentVolume (per segment id), round cursor, samples }
  economy:   { treasury, taxRates[3][3], funding{dept}, loans[], ledger {month, history[]}, carry }
  city:      { name, population, jobs, approval, milestonesReached[], unlocks[], policies[],
               specialisations, achievements[] }
  demand:    { R, C, I (−1..1), factors: {R: Factor[], ...} }
  undo:      UndoRecord[] (bounded)
  log:       CommandLogEntry[] (for replays; bounded in saves)
}
```

Key entities:

```ts
RoadNode    { id, x, z, y, segs: number[] }                 // segs is derived, rebuilt on load
RoadSegment { id, a, b, cx, cz, type: RoadTypeId, length, blocks: [left, right], name }
ZoneBlock   { id, seg, side: 1 | -1, s0, cols, rows,        // cell (c, r) centre = P(s0 + (c+½)·8) +
              zone: Uint8Array, valid: Uint8Array,          //   N·(halfWidth + (r+½)·8), angle = tangent
              bld: Int32Array }                             // building id or 0
Building    { id, def: string, kind: 'zoned'|'service'|'utility'|'park'|'landmark'|'special',
              zone?: 'R'|'C'|'I', density: 0|1|2, wealth: 0|1|2, level: 1..3, variant,
              lot?: {block, col, w, d}, x, z, y, angle, w, d,          // footprint in metres
              access?: {seg, s},                                       // frontage on the road graph
              state: 'construction'|'active'|'abandoned'|'rubble', progress,
              residents, capacity, jobs, workers, students, sick, edu, garbage,
              served: {power, water, sewage}, coverage: {fire, police, health, school, park, ...},
              happiness, factors: Factor[], distress, fire, flags, funding?, modules? }
```

### 2.3 Derived (not saved, rebuilt on load)

Node adjacency, segment polylines and arc-length tables, spatial hashes (segments, cells, buildings),
connected components, coverage caches. Everything derived must be a pure function of saved state so
that load → run stays deterministic.

### 2.4 Client mirror (`ClientWorld`)

Only what rendering and UI need: nodes, segments, blocks (zone + valid + occupied), buildings
(def, footprint, level, state, progress, flags), vehicles, traffic flow per segment, sample routes,
stats, time, notifications, active overlay grid. Details (happiness breakdown, residents) are fetched
by `query` when the inspector opens.

---

## 3. Simulation model

### 3.1 Time

- 1 tick = 1 game minute. 60 ticks = 1 hour. **1 day = 1 calendar month** (1440 ticks): the calendar is
  compressed so a day/night cycle and the monthly budget share one clock. 12 months = 1 year
  (17 280 ticks). The date reads e.g. `Mar, Year 3 — 18:40`.
- Speeds: pause, 1× = 8 ticks/s (a month ≈ 3 min), 2× = 16, 3× = 24.
- The main thread interpolates time of day between frames for smooth lighting.

### 3.2 Schedule

| Period | System |
|---|---|
| every tick | apply commands · move service vehicles · advance fires/incidents · construction progress |
| 10 ticks | growth pass (slice of zone blocks) · occupancy |
| 60 ticks (hour) | economy accrual · demand · incident rolls (fire, crime, sickness) · garbage · utilities (if dirty, else every 2 h) · happiness (slice: all buildings over 4 h) |
| sliced | traffic assignment: a slice of origins each tick, a full round every ~2 h |
| 180 ticks | pollution advection/diffusion · land value · crime decay |
| on change / 4 h | service coverage (dirty on road/service/funding change, and refreshed for congestion) |
| month | budget close + history · education progression · milestones · advisors digest |

### 3.3 Demand (RCI)

Demand is a sum of **named factors**, clamped to [−1, 1]; the UI lists each factor, so the player can
always see why. `pending` capacity (under construction) counts as supply so growth doesn't overshoot.

```
workers      = residents · WORKFORCE_SHARE (0.5)
unemployed   = workers − filledJobs            (from the employment/commute matcher, §3.8)
openJobs     = totalJobs − filledJobs

R = clamp( Jobs:        1.5 · (openJobs + pendingJobs − unemployed − pendingHomes·0.5) / (workers + 100)
         + Newcomers:   0.6 · max(0, 1 − population / 400)          // highway brings settlers
         + Appeal:      0.8 · (approval − 0.55)
         + Taxes:       −0.04 · (avgResidentialTax − 9) )

C = clamp( Shoppers:    1.2 · (residents · SHOP_JOBS_PER_RES (0.12) + tourists·k − cJobsAll) / (cJobsAll + 20)
         + Workforce:   0.6 · unemployed / (workers + 50)
         + Goods:       −0.4 · goodsShortage                          // M6: freight
         + Taxes:       −0.04 · (avgCommercialTax − 9) )

I = clamp( Workforce:   1.5 · unemployed / (workers + 50)
         + Exports:     0.25 · highwayConnected · tradeMultiplier     // regional demand for goods
         + Freight:     −0.3 · freightCongestion
         + Taxes:       −0.04 · (avgIndustrialTax − 9) )
```

The loop: settlers → unemployed workers → C/I demand → jobs → R demand → … Exports and appeal keep
the loop gain above 1 for a well-run city and below 1 for a badly run one. Per-wealth tax rates add a
term to the spawn probability of that wealth level (§3.4), so taxing the rich only slows rich growth.

### 3.4 Growth, upgrading and decline

- **Lots.** Growth walks zone blocks round-robin. A lot is `w` columns × `d` rows of same-zone,
  valid, empty cells starting at row 0 (road frontage). Adjacent columns must differ in angle by
  < 6° (so multi-column buildings don't straddle sharp curves).
- **Spawn.** For each candidate lot per pass: `p = 0.25 · max(0, demand_z) · wealthMod · lvMod`, capped
  by `maxConstructions = 2 + ceil(population / 400)`.
  - `density = min(road.maxDensity, unlockedDensity(zone), lotAllows)`.
  - `wealth` from land value at the lot (§3.10), lowered one step if that wealth's tax term makes its
    spawn chance ≤ 0; high wealth also needs fire+police+health coverage ≥ 0.4.
  - Industry "wealth" = industry tier: 0 dirty, 1 manufacturing, 2 high-tech (needs educated workforce, §3.11).
- **Construction.** `progress += 1 / def.buildTicks` (90–400 ticks). Scaffolding is visible.
- **Occupancy (R).** Each pass residents move toward `target = capacity · clamp(0.3 + happiness, 0, 1)`
  (only moving in while R demand > −0.2). Move-in ≤ 10 % capacity per pass, move-out ≤ 5 %.
- **Jobs (C/I).** `jobs` is capacity; `workers` comes from the matcher (§3.8).
- **Upgrade.** Active, happiness ≥ 0.7 and occupancy ≥ 90 % for 3 consecutive hourly checks, level < 3:
  chance per check → rebuild in place at level+1 (bigger model and capacity). If the road now allows a
  higher density and it's unlocked: redevelop to the next density on a larger lot.
- **Decline.** `distress += 1/h` while happiness < 0.3 or a critical need is unmet (no power/water
  > 12 h, no road access), else `distress −= 2/h`. `distress ≥ 48` ⇒ **abandoned** (occupants leave, jobs 0,
  −0.15 land value within 64 m, 4× fire risk). Abandoned buildings re-occupy if their would-be happiness
  stays > 0.5 for 24 h. Businesses **close** (jobs 0) after 12 h without power or water, before abandoning.

### 3.5 Economy

Money is **integer dollars**. Each hour every income/expense category accrues a float amount; the
integer part is booked to the ledger and the fraction is carried to the next hour, so over time nothing
is lost and at every instant `Δtreasury = Σ ledger entries` exactly (one-off costs, refunds and loans
are ledger entries too). Monthly rates below are divided by 24 per hour.

```
Tax(R, b)   = residents_b · RES_INCOME[w] · rateR[w] / 100            RES_INCOME = 12, 22, 40 $/month
Tax(C, b)   = workers_b · COM_INCOME[w] · rateC[w] / 100 · (0.5 + 0.5·customers_b)   30, 50, 80
Tax(I, b)   = workers_b · IND_INCOME[t] · rateI[t] / 100 · (0.6 + 0.4·freightOK_b)    25, 45, 70
Upkeep(b)   = def.upkeep · funding_dept(0–150 %) · (1 + 0.5·modules)
Roads       = Σ length · ROAD_UPKEEP[type]                             $/m/month
Loans       = annuity payment: P · r / (1 − (1 + r)^−n), r = annual/12, n months
Policies    = policy.monthlyCost (some scale with population)
Trade       = export revenue, specialisation revenue (M10)
```

- 9 tax rates (R/C/I × low/med/high, 0–20 %, default 9 %). Taxes enter demand (§3.3), spawn chance per
  wealth, and happiness (§3.9).
- Funding effectiveness `eff(f) = f ≤ 1 ? f : 1 + 0.5·(f − 1)` (diminishing returns above 100 %).
- Budget panel: current month ledger by line, last 24 months history, projection = last full month.
- Loans: 25k/50k/100k (more at later milestones), 6–9 % a year, 5-year term, repay early allowed.
- **Bankruptcy.** Treasury < 0 ⇒ escalating warnings; after 2 months continuously negative
  (the grace period) the city is **bankrupt**: game over screen, the sim refuses further commands except
  load/new game. Sandbox: huge treasury and no bankruptcy.

### 3.6 Utilities (power, water, sewage, garbage)

Civic buildings (`src/data/civic.ts`) are placed by the player beside a road, facing it; their front
edge must touch the road corridor, which gives their access point on the graph. Zone cells under them
become invalid. Use per consumer = capacity × a per-zone rate (`UTILITY_USE`).

Flow through the road network. For utility U, each network component `k` has
`supply_k = Σ plant.capacity · eff(funding) · condition` (water pumps × `0.3 + 0.7·groundwater` at the
pump; river pumps full). Consumers are sorted by road travel distance to the nearest producer
(multi-source Dijkstra) and served in that order until supply runs out, so shortages hit the far end
of the network first — readable on the data map. `served_b ∈ [0, 1]`.

- Water is **polluted** if ground pollution at a pump > 0.3: buildings on that component get a sickness
  modifier. Sewage demand = water use; outflow pipes emit ground/water pollution downstream; treatment
  plants don't. Unserved sewage adds ground pollution at the building.
- Garbage: `garbage_b += rate_b/h`. Landfills/recycling/incinerators dispatch trucks (real vehicles)
  to the fullest buildings in their road coverage; a truck collects up to its capacity from the target
  and its neighbours and returns. Landfills fill up; incinerators make power and air pollution; recycling
  earns trade revenue. Piles are drawn above a threshold.
- Consequences escalate: happiness penalty immediately (§3.9) → businesses close after 12 h without
  power/water → distress towards abandonment (§3.4). Icons over buildings; advisor alerts.

### 3.7 Service coverage and incidents

- **Coverage** of a service building: bounded Dijkstra from its access point in travel **time** over
  the road graph using current congested speeds; coverage at time `t` is
  `eff(funding) · clamp((T_max − t) / (0.5·T_max), 0, 1)` (full within half the range).
  T_max: fire 90 s, police 100 s, clinic 80 s, hospital 150 s, schools 60–120 s, parks 45 s.
  A building's coverage is the max over stations of that type. The data map rasterizes per-segment
  coverage, so coverage visibly follows the roads.
- **Capacity**: vehicles (fire/police/ambulance/garbage), beds (health), seats (education). Seats and
  beds are allocated nearest-first by the same Dijkstra (like jobs).
- **Incidents**, rolled hourly per building:
  - Fire: `p = FIRE_BASE[kind] · (1 − 0.75·fireCov) · policy · (abandoned ? 4 : 1)`. Intensity grows
    0 → 1 over ~50 ticks, spreads to buildings within 16 m (`p = 0.05·intensity` every 10 ticks), and
    destroys the building after 120 ticks at full intensity (→ rubble). The nearest station with a free
    engine dispatches it along the shortest path; on arrival it lowers intensity until out.
  - Crime: `rate = CRIME_BASE · (1 + 2·unemployment + 0.5·[low wealth] + 1.5·max(0, 0.5 − H)) ·
    (1 − 0.8·policeCov)`. A patrol car is dispatched; if it arrives within 20 game minutes the crime is
    stopped, otherwise the crime grid rises around the building.
  - Sickness and emergencies: see §3.11; ambulances are dispatched for emergencies.
- Service vehicles are sim entities with a route of road legs and progress, moving each tick at the
  segment's congested speed — traffic delays response. The renderer extrapolates them between frames.
- **Vehicle time.** One tick is a game minute, so a truck driving at real speed would cross the map in
  a few ticks (a blur on screen). Dispatched vehicles instead move `0.2 m per tick per m/s of road
  speed` (≈ 60 km/h on screen at 1×), and incident timings (fire spread, collection rounds) are tuned
  in ticks to match. Commute times used for happiness stay realistic. (The Cities: Skylines approach:
  the clock runs faster than the cars.)

### 3.8 Traffic, commuting and employment

One mechanism does job matching, shopping and traffic:

1. **Origins** = road nodes with residents attached (buildings attach to the nearer end of their segment).
   Each round processes origins in a rotating order (fairness) across ticks.
2. For an origin, a Dijkstra over **congested travel times** visits job buildings in order of time;
   workers fill open job slots nearest-first (education-matched first, over-qualified second), up to
   `MAX_COMMUTE` (30 min). The same search fills shop capacity with shoppers and school seats.
3. Each assignment of `n` trips follows the predecessor tree back to the origin, adding `n·PCU` to
   `nextVolume[segment]`. Freight: industry → commerce (goods) and surplus → highway; highway → commerce
   for imports (trucks count 2.5 PCU).
4. At the end of a round: `volume = volume + α·(nextVolume − volume)` (method of successive averages,
   α = 0.35), and filled jobs/unemployment/commute times are published.
5. Travel time per segment: `t = length / speed · (1 + 0.15·(v/c)^4)`, capped at 8× free-flow, where
   `v = volume · PEAK_SHARE` (0.35 of daily trips in the peak hour) and `c` = capacity per road type.
6. **Rush hours**: instantaneous flow = `volume · profile(hour)`, peaks at 08:00 and 17:30; congestion
   shown on the traffic map and used for service vehicles is the instantaneous one; commute time (for
   happiness) uses the peak.
7. **Visible vehicles**: each round keeps ~400 sample routes by reservoir sampling weighted by trips,
   tagged `{from, to, purpose}`. The main thread spawns cars along sampled routes in proportion to
   current flow and time of day (commute out in the morning, back in the evening, shopping midday,
   freight all day) and moves them at the segment's congested speed. Clicking one shows its trip.
8. **Buses (M6)**: stops on segments, lines = ordered stops, a depot supplies buses. For an origin and
   destination within 400 m of stops on one line: `transitTime = walk + headway/2 + ride`; bus share
   `= capacityLimited(logistic((carTime − transitTime)/4 min))`; bus riders don't add car volume.

### 3.9 Happiness

Per building, `H = clamp(0.55 + Σ contributions, 0, 1)`; each contribution is stored as a named
factor for the inspector (e.g. "No water: −30 %").

| Factor | Residential contribution |
|---|---|
| Power / water / sewage | −0.30 / −0.30 / −0.15 · (1 − served); polluted water −0.10 |
| Garbage | −0.15 · clamp((garbage − 10) / 30, 0, 1) |
| Fire / police / health / education | +0.05·cov − 0.06·(1 − cov)·expect[w] each |
| Parks & amenities | +0.10 · parkCov (+ landmarks, policies) |
| Commute | +0.06 at ≤ 8 min, linear to −0.12 at ≥ 25 min |
| Jobs | −0.15 · unemploymentRate(b) |
| Shopping | +0.04·shopAccess − 0.06·(1 − shopAccess) |
| Air / ground pollution | −0.20·air·sens[w] / −0.10·ground |
| Crime | −0.15 · crime |
| Taxes | −0.015 · (rateR[w] − 9) · taxSens[w] |
| Sickness | −0.20 · sickFraction |

`expect = [0.6, 1.0, 1.5]`, `sens = [0.8, 1.0, 1.4]`, `taxSens = [1.4, 1.0, 0.8]` (low/med/high).
Wealthier residents pay more and expect more: that's the core tension. Commercial: utilities,
customers, workers, goods, crime, fire, taxes. Industrial: utilities, workers, freight access, fire,
taxes. **Approval** = 85 % resident-weighted residential H + 15 % job-weighted business H.

### 3.10 Land value and wealth

Raster (16 m), recomputed every 3 h and eased (`LV += 0.25·(target − LV)`), then 3×3 blurred:

```
target = 0.35 + 0.12·waterfront + 0.05·elevationView + 0.15·park + 0.10·avgServiceCov
       + 0.05·trees + 0.10·(neighbourHappiness − 0.5) + landmarks + 0.05·roadClass
       − 0.30·air − 0.20·ground − 0.20·crime − 0.15·abandonedNearby − 0.10·industryNuisance
```

Wealth that moves in: `LV < 0.40` low, `< 0.70` medium, else high. Happy buildings in a higher-LV
area redevelop to the higher wealth (gentrification); decline lowers it.

### 3.11 Environment, health and education

- **Air pollution** raster, every 3 h: add sources (industry by tier, power plants, incinerators,
  traffic `volume·k` along segments) → semi-Lagrangian advection by the wind (prevailing direction
  from the seed, slowly wobbling) → diffusion (k = 0.15) → decay ×0.9 → absorption by trees and parks.
- **Ground pollution**: industry, landfill, sewage outflow, unserved sewage; slow spread; decays ×0.995.
- **Sickness**: per hour `newSick = residents · (0.0005 + 0.004·air + 0.003·ground + 0.004·[polluted
  water] + 0.002·[garbage])`. Clinics/hospitals treat sick residents in their coverage up to bed
  capacity (nearest-first). Untreated sick for > 24 h: some leave or die (population loss), and the
  happiness penalty applies. Emergencies (a share of new cases) dispatch ambulances.
- **Education**: students = 20 % of residents. Seats allocated nearest-first. Each month
  `edu += 0.08·primaryCov (to 1) + 0.06·highCov (to 2) + 0.04·uniCov (to 3) + library`, with newcomers
  arriving at edu 0.5. Workforce education decides which industry tiers can grow: tier 1 needs
  ≥ 40 % of workers at edu ≥ 1, tier 2 (high-tech, clean) ≥ 30 % at edu ≥ 2 and medium LV.

### 3.12 Disasters (M9)

Earthquake (epicentre + radius: damage probability by distance, collapses → rubble, starts fires),
tornado (moving path, destroys buildings along a swath), flood (terrain below `waterLevel + h` near
water floods for a while: buildings damaged/closed), meteor (impact crater radius: destroy + fires).
Rubble must be cleared (bulldoze, or free auto-clear by a nearby fire station over time); lots then
regrow. Disasters on/off in options; fires always on.

### 3.13 Progression (M10)

Population milestones unlock road types, densities, services, modules, policies, specialisations and
landmarks (`src/data/unlocks.ts`): e.g. 0 (dirt road, street, low density, basics), 500 (avenue,
medium density), 2 000, 5 000 (high density), 10 000, 25 000, 50 000, 100 000. Service buildings take
add-on modules (+capacity, +upkeep). Specialisations: tourism (landmarks, hotels, attractions →
tourist visits and revenue), trade (freight hub, ore mine / oil well on resource deposits → export
revenue), technology (university-driven high-tech campus → tax and education boost).

### 3.14 How the systems feed each other

```
         taxes ─────────────┐                  ┌──────────── land value ◄── parks, water, services
                            ▼                  ▼                               ▲       │
 zoning ─► lots ─► GROWTH ◄─ DEMAND ◄── employment/shopping ◄── TRAFFIC ◄──────┼───┐   │ wealth
            ▲        │         ▲             (matcher)            │  congestion  │   │   ▼
            │        ▼         │                                  ▼              │   │ RESIDENTS
            │    buildings ────┴──► ECONOMY ◄── upkeep ◄── services, utilities   │   │   │
            │        │                 │                        │               │   │   │
            │        ▼                 ▼                        ▼               │   │   ▼
            │   UTILITIES, SERVICES (road coverage, capacity) ──► HAPPINESS ─────┘   │ approval
            │        │                                             ▲    ▲            │
            │        ▼                                             │    │            │
            │   pollution (wind) ──► sickness ──► health ──────────┘    │            │
            │   crime ◄── unemployment, low happiness ──────────────────┘            │
            └── decline / abandonment ◄── unhappiness, unmet needs ◄─────────────────┘
```

---

## 4. Rendering

- **Scene**: WebGL2 renderer, ACES tone mapping, sRGB. Hemisphere + directional sun (PCF soft shadows,
  shadow camera fitted around the view target and sized by zoom) + small ambient. Gradient sky dome
  shader with sun disc and stars; fog matches the horizon colour. Day/night drives sun direction and
  colour, sky colours, window emission and street lights.
- **Terrain**: buildable area as 8×8 chunks (32×32 quads each) with vertex colours (grass hues from
  noise, sand near water, rock on slopes); scenery ring at lower resolution. A shader hook samples the
  active overlay texture (data maps) and draws the buildable-area border.
- **Water**: one large plane at `y = 0` with a shader: depth from a height texture (shallow tint,
  shoreline foam), procedural ripples, sky reflection tint.
- **Trees**: 3 species, instanced per 256 m chunk (frustum-culled), placements hashed from the tree
  grid; trees under roads/buildings are filtered out on change.
- **Roads**: per-segment ribbon meshes (asphalt + sidewalk + markings via vertex colour and a tiny
  procedural texture) draped on terrain with polygon offset; intersections as fans; merged per chunk.
- **Buildings**: `AssetRegistry.get(key)` returns a procedural geometry built from parts (walls with
  window grids, pitched/flat roofs, parapets, awnings, signs, chimneys) seeded by variant; vertex
  attributes: colour, emissive-window mask, baked AO. Completed buildings are merged per 128 m chunk
  (rebuilt incrementally, ≤ 2 chunks per frame); buildings under construction and burning ones are
  individual meshes with scaffolding/flames. The registry can later return glTF-loaded geometry.
- **Vehicles**: instanced meshes per vehicle class; matrices updated in place (no per-frame allocation).
- **Overlays**: a 128×128 `DataTexture` per active data map, sampled by terrain and building shaders
  with a colour-blind-friendly ramp (viridis/cividis) and legend.
- **Picking**: a 2D spatial index of building oriented boxes walked along the view ray (no GPU picking).
- **Post** (optional): tilt-shift blur when zoomed in.

## 5. UI

Preact components over the canvas. All colours, type scale, spacing, radii and shadows are CSS custom
properties in `src/ui/styles/tokens.css`. Top bar (money, net income, population, date/time, speed,
RCI, approval), bottom toolbar by category with SVG icons and tooltips (cost, upkeep, effect, shortcut),
panels (budget, inspector, data maps, advisors, policies), notifications, debug panel (backtick),
menus. The UI reads `ClientWorld` via a small subscribe/selector hook and sends commands through
`SimClient`.

## 6. Saves

`{format: 'citybloom-save', version, meta {name, population, date, savedAt}, state}`; typed arrays are
base64 in JSON; compressed with gzip (fflate) and stored in IndexedDB (slots + autosave), exported/imported
as files. `migrations[v]` upgrades version v → v+1 on load. Round-trip is tested by state hash.

## 7. Testing and tooling

- Vitest unit tests for every system; scenario tests build cities by commands and run for years with
  per-tick invariants in test mode (no NaN/Infinity, no negatives, in bounds, money balances).
- Playwright e2e against a `--mode test` build: builds a small town through the real UI, runs time,
  opens panels, screenshots presets into `docs/screenshots/`, fails on console errors.
- `scripts/bench.ts` (large city: sim tick ms, draw calls, triangles) and `scripts/balance.ts`
  (careful / greedy / neglectful strategies over 20+ years, CSV + ASCII curves).

## 8. Performance budget

- Sim: average tick < 1 ms and worst tick < 15 ms at 100k residents (sliced systems), so 3× speed
  uses < 5 % of a worker core on average and never stalls the worker for long.
- Render: < 300 draw calls, < 1.5 M triangles at the default overview; no allocations in per-frame
  paths (vehicles, camera, animation); chunk rebuilds budgeted per frame.
