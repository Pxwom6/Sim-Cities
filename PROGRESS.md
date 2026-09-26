# PROGRESS

- [x] M0 Foundation
- [x] M1 Roads and zoning
- [x] M2 Growth
- [x] M3 Money
- [x] M4 Utilities
- [x] M5 Services and happiness
- [x] M6 Traffic and transport
- [x] M7 Environment, health and education
- [x] M8 Life and feedback
- [x] M9 Disasters
- [x] M10 Progression and specialisations
- [x] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M12 Balance, performance and polish (not started). Plan:
- `scripts/balance.ts`: headless strategies (careful, greedy, neglectful) played through commands for
  20+ game years, printing population, treasury, approval and demand curves (CSV + ASCII); tune
  `src/data` until careful play grows steadily with real trade-offs and careless play gets into trouble.
  Start with the known issues below (early-game utility and service costs vs. taxes, early abandonment,
  commercial demand in small towns).
- Performance at scale: grow a ~100k-resident city in the benchmark, profile the hourly systems, and keep
  the tick within budget (DESIGN §8); record draw calls and triangles; Mac checks below.
- Soak test: a long e2e run at top speed over a grown city with random disasters on, asserting zero
  console errors; invariants on in test mode.
- Bug bash and a final review against every SPEC item (done, or explained in docs/DECISIONS.md); README;
  summary and ideas for what's next at the top of this file.

## Next tasks
1. Write `scripts/balance.ts` with the three strategies; run it and record the curves.
2. Tune the early game (utility/service upkeep vs. taxes, grace for new buildings without power).
3. Scale the benchmark to 100k residents and optimise the slowest systems.
4. Soak test, bug bash, README, final summary.

## Known issues
- Visible cars and walkers follow trip samples from the last assignment round, so for up to two game hours after a road closes some still drive along it; commuters, services and utilities reroute at once.
- Buildings along a road closed for repairs lose power and water until it reopens (lines run under the roads); with 6–24 h repairs this rarely empties them, but a big quake still costs a town a lot.
- A town without utilities drops to ~0 % approval quickly; balance the early-game grace in M12 (e.g. softer penalties for the first days).
- Early utility upkeep (coal + pumps + treatment + landfill ≈ $1,600/month) exceeds a small town's taxes; wind turbines are the cheap start. Tune in M12.
- A full service kit (fire, police, clinic, school, park ≈ $1,240/month) plus utilities leaves a 750-resident town about $3,000/month in the red. Service costs vs. taxes need the M12 balance pass (the balance script will show it).
- Homes without power or water are abandoned after about two days, even in a brand-new town; M12 should consider a grace period for buildings that never had power.
- Visible cars don't queue or yield at junctions; they overlap when paths cross. Speeds do follow congestion.
- Bus riders' door-to-door time includes walking and waiting, so a bus line mainly helps by taking cars off jammed roads (≈10–20 % less traffic in the test town), not by being faster than driving.
- Towns without services still lose many residents over time (approval ≈ 50 %); fire outbreaks are now contained but crime and unanswered emergencies pile up. Part of the M12 balance pass.
- Commercial demand runs slightly negative in small towns (0.12 shop jobs per resident); revisit in balance.
- The main menu's backdrop is the bare default map; a small pre-grown demo town there would show the game off better (M12 polish).
- Visitors (M10) are counted, spend money and shop, but don't drive through the traffic model yet.
- Growth all the way to 100k residents is only exercised by the M12 large-city benchmark so far; M10 tests the unlock table and each specialisation on the test town.
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M10; M11 adds no per-tick work)
- `npx tsx scripts/bench.ts 12 9`: ~11–13k residents, tick avg ~0.11–0.21 ms, p99 ~2–9 ms, worst ~29 ms (hourly systems + 3-hourly air pollution and land value). Progression, tourism and extraction are hourly passes over the civic buildings only (no measurable cost). Disasters cost nothing while none is active.
- Night town (720 residents, M9): ~95 draw calls, ~0.75M triangles on SwiftShader. A tornado adds 3 point systems (~2,200 points); flood water is one mesh; dust bursts share one point system.
- Procedural models: mean triangles per building R0 139, R1 329, R2 622, C0 102, C1 254, C2 481, I 174–217 (`scripts/dev/modelstats.ts`).

## To check on the Mac
- Game shell: the main menu's slow orbit over the backdrop should be smooth; the three quality levels should look and perform distinctly; interface size 140 % on a laptop screen (the top bar drops the Jobs stat and city name when it would not fit).
- Landmarks and specialisation buildings (clock tower, wheel, sky needle, arch, hotel, mine, well, freight terminal, research park): how they look close up at full resolution, and the milestone banner's confetti at 60 fps.
- Disasters: frame rate with a tornado funnel and flood water on screen; whether the earthquake camera shake feels right at 60 fps.
- Audio: listen to the effects (build, zone, bulldoze, place, alert, siren) and the ambient bed over a busy street, woods by day and night, and from high up; check the mix and that nothing clips.
- Tilt-shift (menu → Graphics): frame cost at 60 fps and whether the blur strength feels right.
- Pedestrians at street level: frame time with 240 walkers.
- Frame rate while panning the overview and street presets (expect 60 fps).
- Fire/smoke particles and siren lights: check they read well and cost little at 60 fps.
- Visible traffic at 360 cars: frame time while panning; cars overlap at junctions (no car-following model).
