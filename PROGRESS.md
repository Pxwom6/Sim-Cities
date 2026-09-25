# PROGRESS

- [x] M0 Foundation
- [x] M1 Roads and zoning
- [x] M2 Growth
- [x] M3 Money
- [x] M4 Utilities
- [x] M5 Services and happiness
- [x] M6 Traffic and transport
- [ ] M7 Environment, health and education
- [ ] M8 Life and feedback
- [ ] M9 Disasters
- [ ] M10 Progression and specialisations
- [ ] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M7 Environment, health and education (not started).

## Next tasks
1. Air pollution raster with a prevailing wind (industry, power plants, traffic volumes as sources; trees and parks absorb); ground pollution already exists (M4).
2. Health: sickness per building from air/ground pollution and polluted water; clinics/hospitals treat within bed capacity (the M5 `capacity` on health defs); untreated sickness lowers happiness and population; a health data map.
3. Education levels per building (from school seats over time); educated workforce lets industry tiers rise (manufacturing, high-tech); university/library effects.
4. Trees and parks: absorb air pollution, raise land value (partly there); planting trees tool? (decide).
5. Scenario tests: a polluting district measurably harms health downwind (not upwind), and cleaner choices (wind/solar, parks, moving industry) measurably help; e2e + screenshots (air pollution map, sickness icons).

## Known issues
- A town without utilities drops to ~0 % approval quickly; balance the early-game grace in M12 (e.g. softer penalties for the first days).
- Early utility upkeep (coal + pumps + treatment + landfill ≈ $1,600/month) exceeds a small town's taxes; wind turbines are the cheap start. Tune in M12.
- A full service kit (fire, police, clinic, school, park ≈ $1,240/month) plus utilities leaves a 750-resident town about $3,000/month in the red. Service costs vs. taxes need the M12 balance pass (the balance script will show it).
- Homes without power or water are abandoned after about two days, even in a brand-new town; M12 should consider a grace period for buildings that never had power.
- Visible cars don't queue or yield at junctions; they overlap when paths cross. Speeds do follow congestion.
- Bus riders' door-to-door time includes walking and waiting, so a bus line mainly helps by taking cars off jammed roads (≈10–20 % less traffic in the test town), not by being faster than driving.
- Commercial demand runs slightly negative in small towns (0.12 shop jobs per resident); revisit in balance.
- Night lighting is serviceable but plain until M8 (lit windows, street lights).
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M6)
- `npx tsx scripts/bench.ts 12 9`: peaks at 15k residents / 608 buildings; sim tick avg 0.18–0.32 ms, p99 ≤ 12.6 ms, worst ~37 ms (hourly systems + the 2-hourly matcher with traffic assignment). A full year runs in 4.2 s.
- Served test town with traffic and buses: ~175 draw calls, ~0.8M triangles on SwiftShader (trees dominate); up to 360 cars + buses as instanced meshes (4 car models + buses = 5 draw calls).

## To check on the Mac
- Frame rate while panning the overview and street presets (expect 60 fps).
- Fire/smoke particles and siren lights: check they read well and cost little at 60 fps.
- Visible traffic at 360 cars: frame time while panning; cars overlap at junctions (no car-following model).
