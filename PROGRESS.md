# PROGRESS

- [x] M0 Foundation
- [x] M1 Roads and zoning
- [x] M2 Growth
- [x] M3 Money
- [x] M4 Utilities
- [ ] M5 Services and happiness
- [ ] M6 Traffic and transport
- [ ] M7 Environment, health and education
- [ ] M8 Life and feedback
- [ ] M9 Disasters
- [ ] M10 Progression and specialisations
- [ ] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M5 Services and happiness (not started).

## Next tasks
1. Service civic defs (fire station, police station, clinic, hospital, primary/high school, university, library, parks and plazas) with capacity and road-distance coverage (bounded Dijkstra in travel time, funding-scaled).
2. Incidents with dispatch: fires (ignite, grow, spread, destroy → rubble, engines extinguish), crime (patrol cars), emergencies (ambulances); vehicles reuse the M4 vehicle system.
3. Full happiness model (services, parks, crime, taxes by wealth expectations) and approval; land value with services/parks/crime; high wealth needs services.
4. Coverage data maps (fire, police, health, education, parks, crime) and coverage preview while placing services.
5. Scenario tests: coverage follows roads, vehicles respond, every building explains its mood.

## Known issues
- A town without utilities drops to ~0 % approval quickly; balance the early-game grace in M12 (e.g. softer penalties for the first days).
- Early utility upkeep (coal + pumps + treatment + landfill ≈ $1,600/month) exceeds a small town's taxes; wind turbines are the cheap start. Tune in M12.
- Mood tops out around 0.65 until services exist (M5); upgrade threshold set to 0.62 for now.
- Commercial demand runs slightly negative in small towns (0.12 shop jobs per resident); revisit in balance.
- Night lighting is serviceable but plain until M8 (lit windows, street lights).
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M2)
- `npx tsx scripts/bench.ts 12 9`: grid city of 193 segments grows to 10.2k residents / 414 buildings in 7 months. Sim tick avg 0.06 ms, p99 1.5 ms, worst 17.5 ms (hourly systems). Full year simulated in 1.05 s.
- Grown test town (137 buildings): 82 draw calls, ~850k triangles on SwiftShader at the town view (trees dominate).

## To check on the Mac
- Frame rate while panning the overview and street presets (expect 60 fps; M0 has no city yet).
