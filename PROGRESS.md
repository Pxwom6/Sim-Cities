# PROGRESS

- [x] M0 Foundation
- [x] M1 Roads and zoning
- [x] M2 Growth
- [x] M3 Money
- [x] M4 Utilities
- [x] M5 Services and happiness
- [x] M6 Traffic and transport
- [x] M7 Environment, health and education
- [ ] M8 Life and feedback
- [ ] M9 Disasters
- [ ] M10 Progression and specialisations
- [ ] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M8 Life and feedback (not started).

## Next tasks
1. Advisors (finance, utilities, safety, health, education, transport, environment): each reads the sim's stats and names the worst problem with a concrete suggestion; notification feed with rate limits.
2. Resident thoughts feed ("Third day without water. We're moving out.") generated from real building states, clickable to the building.
3. Full set of data maps with legends (check SPEC list: power, water, sewage, garbage, fire, police, health, education, crime, air, ground, land value, wealth, happiness, traffic, resources — mostly done) + natural resources map polish.
4. Street names (procedural, original), shown on hover/inspector and as labels at close zoom.
5. Day/night: street lights, lit windows (partly there), headlights; construction animation polish; procedural audio (Web Audio): UI clicks, build/zone/bulldoze, alerts, sirens, ambient bed by zoom; a building-variety pass.
6. e2e + screenshots (night city, advisors panel); a new player can find what's wrong from advisors and data maps alone.

## Known issues
- A town without utilities drops to ~0 % approval quickly; balance the early-game grace in M12 (e.g. softer penalties for the first days).
- Early utility upkeep (coal + pumps + treatment + landfill ≈ $1,600/month) exceeds a small town's taxes; wind turbines are the cheap start. Tune in M12.
- A full service kit (fire, police, clinic, school, park ≈ $1,240/month) plus utilities leaves a 750-resident town about $3,000/month in the red. Service costs vs. taxes need the M12 balance pass (the balance script will show it).
- Homes without power or water are abandoned after about two days, even in a brand-new town; M12 should consider a grace period for buildings that never had power.
- Visible cars don't queue or yield at junctions; they overlap when paths cross. Speeds do follow congestion.
- Bus riders' door-to-door time includes walking and waiting, so a bus line mainly helps by taking cars off jammed roads (≈10–20 % less traffic in the test town), not by being faster than driving.
- Towns without services still lose many residents over time (approval ≈ 50 %); fire outbreaks are now contained but crime and unanswered emergencies pile up. Part of the M12 balance pass.
- Commercial demand runs slightly negative in small towns (0.12 shop jobs per resident); revisit in balance.
- Night lighting is serviceable but plain until M8 (lit windows, street lights).
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M7)
- `npx tsx scripts/bench.ts 12 9`: tick avg ~0.2–0.3 ms, worst ~40 ms (3-hourly air pollution + land value + hourly systems). Air pollution update ≈ 3 ms at 128² cells.
- Served town: ~180 draw calls (smoke/flames/sirens are 4 point systems), ~0.8M triangles on SwiftShader.

## To check on the Mac
- Frame rate while panning the overview and street presets (expect 60 fps).
- Fire/smoke particles and siren lights: check they read well and cost little at 60 fps.
- Visible traffic at 360 cars: frame time while panning; cars overlap at junctions (no car-following model).
