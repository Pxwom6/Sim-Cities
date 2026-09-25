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
- [ ] M10 Progression and specialisations
- [ ] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M10 Progression and specialisations (not started). Plan:
- `src/data/unlocks.ts`: one table of population milestones (village → 100k) listing what each unlocks
  (road types, densities, civic buildings, modules, policies, specialisations, landmarks), used by the
  sim's unlock checks and by the UI; a "milestone reached" event with a celebratory banner + sound.
- Service modules: add-ons to fire, police, clinic/hospital, schools (extra engines/cars/ambulances,
  classrooms, beds) raising capacity and upkeep; placed from the inspector (command `addModule`).
- Policies: a Policies panel; each with monthly cost and a sim effect (free buses → more riders; smoke
  detectors → fewer fires; recycling → less garbage; tourism campaign → visitors; high-rise ban,
  clean-industry incentive, etc.). Tests measure each effect.
- Specialisations: tourism (original landmarks, hotels, attractions → visitors, spending, revenue),
  trade (freight hub; ore mine/oil well on deposits → exports), technology (university + high-tech
  campus → tax and education boost). Each with its own buildings and a revenue line.
- Achievements: a handful of fun goals, shown in a panel with toasts when earned.
- Balance run to 100k with a scripted strategy to confirm regular unlocks.

## Next tasks
1. Unlock table + milestone events + UI banner; migrate existing `unlockPopulation` fields to it.
2. Policies (sim + panel + tests), then service modules.
3. Specialisations with buildings, economy lines and tests; landmarks.
4. Achievements; e2e `m10-progression` with screenshots; scripted growth to 100k.

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
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M9)
- `npx tsx scripts/bench.ts 12 9`: ~11–13k residents, tick avg ~0.15–0.3 ms (varies with VM load), p99 ~7–12 ms, worst ~25–60 ms (hourly systems + 3-hourly air pollution and land value). Disasters cost nothing while none is active; an earthquake or meteor strike is a one-off pass over the buildings near it.
- Night town (720 residents): ~95 draw calls, ~0.75M triangles on SwiftShader. A tornado adds 3 point systems (~2,200 points); flood water is one mesh; dust bursts share one point system.
- Procedural models: mean triangles per building R0 139, R1 329, R2 622, C0 102, C1 254, C2 481, I 174–217 (`scripts/dev/modelstats.ts`).

## To check on the Mac
- Disasters: frame rate with a tornado funnel and flood water on screen; whether the earthquake camera shake feels right at 60 fps.
- Audio: listen to the effects (build, zone, bulldoze, place, alert, siren) and the ambient bed over a busy street, woods by day and night, and from high up; check the mix and that nothing clips.
- Tilt-shift (menu → Graphics): frame cost at 60 fps and whether the blur strength feels right.
- Pedestrians at street level: frame time with 240 walkers.
- Frame rate while panning the overview and street presets (expect 60 fps).
- Fire/smoke particles and siren lights: check they read well and cost little at 60 fps.
- Visible traffic at 360 cars: frame time while panning; cars overlap at junctions (no car-following model).
