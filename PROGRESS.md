# PROGRESS

- [x] M0 Foundation
- [x] M1 Roads and zoning
- [x] M2 Growth
- [x] M3 Money
- [x] M4 Utilities
- [x] M5 Services and happiness
- [ ] M6 Traffic and transport
- [ ] M7 Environment, health and education
- [ ] M8 Life and feedback
- [ ] M9 Disasters
- [ ] M10 Progression and specialisations
- [ ] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M6 Traffic and transport (not started).

## Next tasks
1. Traffic assignment from the matcher (DESIGN §3.8): per-segment volumes (MSA), BPR travel times, rush-hour profile; congested times feed commutes and service vehicles (invalidate the coverage cache when congestion changes materially, or keep coverage on free-flow and document it).
2. Visible commuter cars and freight trucks sampled from real trips (instanced, clickable: from/to/why); traffic data map.
3. Road upgrades (change type in place, keep buildings) and bridges over water.
4. Buses: stops, lines, depot; mode share by time comparison; scenario test that a bypass or bus line cuts commute times.
5. e2e + screenshots of jams forming where expected.

## Known issues
- A town without utilities drops to ~0 % approval quickly; balance the early-game grace in M12 (e.g. softer penalties for the first days).
- Early utility upkeep (coal + pumps + treatment + landfill ≈ $1,600/month) exceeds a small town's taxes; wind turbines are the cheap start. Tune in M12.
- A full service kit (fire, police, clinic, school, park ≈ $1,240/month) plus utilities leaves a 750-resident town about $3,000/month in the red. Service costs vs. taxes need the M12 balance pass (the balance script will show it).
- Homes without power or water are abandoned after about two days, even in a brand-new town; M12 should consider a grace period for buildings that never had power.
- Commercial demand runs slightly negative in small towns (0.12 shop jobs per resident); revisit in balance.
- Night lighting is serviceable but plain until M8 (lit windows, street lights).
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M5)
- `npx tsx scripts/bench.ts 12 9` (grid city with utilities and services along the avenues): peaks at 14.6k residents / 674 buildings in month 4. Sim tick avg 0.2–0.3 ms, p99 ≤ 10 ms, worst ~34 ms (hourly coverage/land value). The population then sags to ~11k as the bench's two coal plants fall short: that's the bench's layout, not a sim fault.
- Served test town with 10 service buildings (147 buildings): ~130 draw calls, ~0.9M triangles on SwiftShader at the town view (trees dominate).

## To check on the Mac
- Frame rate while panning the overview and street presets (expect 60 fps).
- Fire/smoke particles and siren lights: check they read well and cost little at 60 fps.
