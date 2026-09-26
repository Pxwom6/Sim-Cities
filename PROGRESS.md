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

## Summary
Citybloom is a complete, playable city builder in the browser. From the main menu (over a living
demo town) a player founds a city on one of four seeded maps with a difficulty, sandbox and
disasters option and an optional tutorial, then lays straight, curved and free-form roads and
bridges off the highway, zones homes, shops and industry, and keeps the city supplied with power
(five plant types), water and sewage, garbage collection, fire, police, health, schools and parks.
Residents are aggregated per building but travel for real: rush-hour commutes congest roads, buses
take cars off them, service vehicles drive to incidents, and any car or walker can be clicked. Air
pollution drifts on the wind, sickness and education follow services, land value shapes wealth,
and the budget books every dollar (taxes by zone and wealth, funding, loans, policies). Milestones
unlock buildings, landmarks and three specialisations (tourism, trade, technology) plus ore and
oil. Fires, earthquakes, tornadoes, floods and meteors strike and the city rebuilds. Saves are
versioned and compressed with autosave, slots and file export. Everything runs from a deterministic
sim in a Web Worker: ~0.7 ms per tick at 100k residents, with 288 draw calls at the city overview.
Checked by 138 unit and scenario tests, 15 UI tests, a 10-minute soak and a full playthrough through the UI
(`docs/SPEC_REVIEW.md` maps every SPEC item to where it's done).

## Ideas for what's next
1. **Real-hardware pass** (the list under "To check on the Mac"): frame rate at 100k, and
   per-building LOD if 2.5M triangles at the overview is too much for the GPU.
2. **Trams and trains**: the transit system (lines, stops, riders) and road graph are ready for
   rail lines with their own right of way; a rail freight link would feed the trade specialisation.
3. **Visible traffic that queues**: car-following and junction yielding for the drawn cars (the
   sim's congestion already works); tourists driving in from the highway.
4. **Neighbouring cities** that trade power, water and garbage and share the highway's demand.
5. **Weather and seasons**: snow on roofs, rain lowering park use, heating demand in winter.
6. **More specialisations** (education hub, gambling/entertainment, electronics) using the same
   building + economy pattern as M10.
7. **Custom glTF models** through the existing asset registry (`src/render/assets/registry.ts`).
8. **Balance**: commercial demand runs a little low in small towns and mature cities run a large
   surplus; a second tuning pass once real players have tried it.

## In progress
M12 Balance, performance and polish: the final playthrough passes (`npm run playthrough`, 9 min:
775 residents and 57 % approval at year one, 1,042 at year two, 1,156 after a tornado). It found
and fixed four bugs: buildings drawing only shadows in a new city, a dragged road chaining into a
stray road, steep start areas on a third of seeds, and roads along dead ends not joining them.
Now: full e2e run on the final build, then tick M12.

## Next tasks
1. Full e2e on the final build (`npm run e2e`); tick M12 with an `M12 complete:` commit.

## Known issues
- Mature cities run a big surplus (≈ +$35k/month at 18k residents with 6 % taxes); intended as money for landmarks and big projects.
- Homes without power or water still empty after about two days; the balance runs show a careful player never hits this, so no grace period was added.
- Visible cars and walkers follow trip samples from the last assignment round, so for up to two game hours after a road closes some still drive along it; commuters, services and utilities reroute at once.
- Buildings along a road closed for repairs lose power and water until it reopens (lines run under the roads); with 6–24 h repairs this rarely empties them, but a big quake still costs a town a lot.
- Visible cars don't queue or yield at junctions; they overlap when paths cross. Speeds do follow congestion.
- Bus riders' door-to-door time includes walking and waiting, so a bus line mainly helps by taking cars off jammed roads (≈10–20 % less traffic in the test town), not by being faster than driving.
- Towns without services stagnate and slowly lose residents (the neglectful balance run); that's intended, but it could be clearer to a new player why.
- Commercial demand runs slightly negative once a town has zoned a strip of shops (the careful balance player's commercial zones stay part-empty); fine for play, worth a second look.
- Visitors (M10) are counted, spend money and shop, but don't drive through the traffic model yet.
- Growth to 100k residents is exercised by the large-city benchmark (a sandbox grid); a scripted careful player tops out around 18k because its district plan runs out of land.
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M12)
- `npx tsx scripts/bench.ts 30 --big`: a 16×16 avenue grid grows to ~106k residents by month 5. At 80–106k: tick avg 0.6–0.8 ms, p99 5–8 ms, worst per month 9–14 ms (budget: avg < 1 ms, worst < 15 ms). One-off 25–30 ms ticks in the first game hour of a freshly built or loaded big city (cold caches, JIT).
- `npx tsx scripts/bench.ts 12 9` (the older ~12k town): tick avg ~0.12–0.21 ms.
- Rendering the ~100k city (`scripts/dev/bigshot.mjs`, SwiftShader): 288 draw calls / 2.5M triangles at the whole-city overview (about half the triangles are the shadow pass), 156 / 1.8M at the city preset, 92 / 1.05M at street level. Was 1,241 draw calls before civic, building, road and zone chunks were enlarged.
- Night town (720 residents, M9): ~95 draw calls, ~0.75M triangles on SwiftShader. A tornado adds 3 point systems (~2,200 points); flood water is one mesh; dust bursts share one point system.
- Procedural models: mean triangles per building R0 139, R1 329, R2 622, C0 102, C1 254, C2 481, I 174–217 (`scripts/dev/modelstats.ts`).

## To check on the Mac
- The ~100k city (`npx tsx scripts/bench.ts 6 --big --save city.gz`, then Load city → Import from file): frame rate while panning the overview and the city preset at 3× speed (target 60 fps); 2.5M triangles at the overview, if the GPU struggles, per-building LOD is the next step.
- Game shell: the main menu's slow orbit over the backdrop should be smooth; the three quality levels should look and perform distinctly; interface size 140 % on a laptop screen (the top bar drops the Jobs stat and city name when it would not fit).
- Landmarks and specialisation buildings (clock tower, wheel, sky needle, arch, hotel, mine, well, freight terminal, research park): how they look close up at full resolution, and the milestone banner's confetti at 60 fps.
- Disasters: frame rate with a tornado funnel and flood water on screen; whether the earthquake camera shake feels right at 60 fps.
- Audio: listen to the effects (build, zone, bulldoze, place, alert, siren) and the ambient bed over a busy street, woods by day and night, and from high up; check the mix and that nothing clips.
- Tilt-shift (menu → Graphics): frame cost at 60 fps and whether the blur strength feels right.
- Pedestrians at street level: frame time with 240 walkers.
- Frame rate while panning the overview and street presets (expect 60 fps).
- Fire/smoke particles and siren lights: check they read well and cost little at 60 fps.
- Visible traffic at 360 cars: frame time while panning; cars overlap at junctions (no car-following model).
