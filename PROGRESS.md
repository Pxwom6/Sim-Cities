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
- [ ] M9 Disasters
- [ ] M10 Progression and specialisations
- [ ] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M9 Disasters (not started). Plan: `src/sim/systems/disasters.ts` with earthquake, tornado, flood and meteor
(state `disasters`, `roadDamage`, `craters`, `civic.damage`; save v8), damage to buildings (rubble,
fires, casualties → ambulance calls), roads (impassable until repaired, graph skips them) and civic
buildings (offline until repaired, "Disaster repairs" ledger line); random disasters (rare, `disasters`
option, `rng.disasters` stream) and a disasters menu with a targeting tool; renderer effects (camera
shake and dust, tornado funnel along its path, flood water surface, meteor streak, flash and crater),
audio, notifications with a damage report, advisors for rubble and repairs.

## Next tasks
1. Sim core + earthquake + repairs + tests (graph without damaged roads, civics offline, money balances).
2. Tornado (path is a pure function of the disaster and tick), flood (water level curve, flooded buildings/roads/civics), meteor (fall, impact, crater) + tests.
3. Client mirror + renderers + audio; disasters menu and targeting tool; notifications and advisors.
4. Recovery scenario test (rubble clears, lots regrow); e2e `m9-disasters` with screenshots of each disaster.

## Known issues
- A town without utilities drops to ~0 % approval quickly; balance the early-game grace in M12 (e.g. softer penalties for the first days).
- Early utility upkeep (coal + pumps + treatment + landfill ≈ $1,600/month) exceeds a small town's taxes; wind turbines are the cheap start. Tune in M12.
- A full service kit (fire, police, clinic, school, park ≈ $1,240/month) plus utilities leaves a 750-resident town about $3,000/month in the red. Service costs vs. taxes need the M12 balance pass (the balance script will show it).
- Homes without power or water are abandoned after about two days, even in a brand-new town; M12 should consider a grace period for buildings that never had power.
- Visible cars don't queue or yield at junctions; they overlap when paths cross. Speeds do follow congestion.
- Bus riders' door-to-door time includes walking and waiting, so a bus line mainly helps by taking cars off jammed roads (≈10–20 % less traffic in the test town), not by being faster than driving.
- Towns without services still lose many residents over time (approval ≈ 50 %); fire outbreaks are now contained but crime and unanswered emergencies pile up. Part of the M12 balance pass.
- Commercial demand runs slightly negative in small towns (0.12 shop jobs per resident); revisit in balance.
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M8)
- `npx tsx scripts/bench.ts 12 9`: ~11–13k residents, tick avg ~0.25–0.3 ms, p99 ~12 ms, worst ~60 ms (hourly systems + 3-hourly air pollution and land value). M8 adds nothing to the sim tick.
- Night town (720 residents): ~95 draw calls, ~0.75M triangles on SwiftShader (lamps, pools, car lights and walkers are instanced; tilt-shift adds two full-screen passes when on).
- Procedural models: mean triangles per building R0 139, R1 329, R2 622, C0 102, C1 254, C2 481, I 174–217 (`scripts/dev/modelstats.ts`).

## To check on the Mac
- Audio: listen to the effects (build, zone, bulldoze, place, alert, siren) and the ambient bed over a busy street, woods by day and night, and from high up; check the mix and that nothing clips.
- Tilt-shift (menu → Graphics): frame cost at 60 fps and whether the blur strength feels right.
- Pedestrians at street level: frame time with 240 walkers.
- Frame rate while panning the overview and street presets (expect 60 fps).
- Fire/smoke particles and siren lights: check they read well and cost little at 60 fps.
- Visible traffic at 360 cars: frame time while panning; cars overlap at junctions (no car-following model).
