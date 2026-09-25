# SPEC.md: original 3D city-building game

This is the brief and the source of truth for the project. CLAUDE.md has the working rules. Where this spec is silent, use your judgment as a game designer, favour whatever makes the game more fun and more readable, and log the decision in `docs/DECISIONS.md`.

## 1. Vision

A fully featured 3D city builder in the spirit of SimCity (2013). The player is mayor of an empty plot of land beside a regional highway. They lay roads, zone neighbourhoods, supply power, water and services, balance a budget, and keep residents happy as a handful of houses grows into a busy city.

It should feel alive: traffic flowing, sirens heading to fires, lights coming on at dusk, buildings rising and upgrading. The simulation underneath should be deep enough that every decision is a trade-off. Money, happiness, growth, pollution and traffic all pull against each other, and the player can always find out *why* something is happening.

The target is a finished, polished game, not a tech demo: systems that interact, tools that feel good to use, a smooth camera, saves that always load, and no crashes.

## 2. Originality

This is an original game inspired by the city-building genre.

- Genre mechanics are fine to use: zoning, road building, utilities, services, taxes, happiness, data maps, disasters, and the familiar green/blue/yellow colour-coding for residential, commercial and industrial.
- Don't use the SimCity name, any EA or Maxis trademark, or anything copied from those games: no logos, building designs, UI screens, in-game text, sounds, music or characters.
- Choose an original working title that doesn't reference SimCity, and keep it in a single config constant so it's easy to rename.
- Generate art and audio in code. Any third-party library or asset needs a licence that allows this use (MIT, CC0 and similar); record each one in `CREDITS.md`.

## 3. Platform and stack

- Browser game: TypeScript (strict), Vite and Three.js. Vitest for unit and scenario tests, Playwright for end-to-end tests and screenshots, ESLint and Prettier.
- Current stable versions, with few, well-known dependencies. WebGL2 is the safe default renderer.
- UI in HTML/CSS layered over the canvas; a light framework (Preact, Svelte or similar) is fine if it helps. Keep all styling in CSS with design tokens (colours, type scale, spacing, radii, shadows) as CSS custom properties, so the whole look can be restyled without touching game code.
- Target machine: MacBook Pro (Apple M5, 32 GB) in Chrome or Safari.
- Performance budget: a steady 60 fps while panning a large, busy city (about 100k residents, several thousand buildings, hundreds of vehicles on screen), with no frame hitches when the simulation runs at top speed.

## 4. Architecture (firm requirements)

- **Simulation and rendering are separate.** `src/sim` is pure TypeScript with no DOM or Three.js imports. It runs in a Web Worker and talks to the main thread through typed messages. Send compact diffs (transferable typed arrays where it helps) rather than full state every tick, and animate vehicles on the main thread along routes the sim provides. The renderer and UI read sim state and never mutate it.
- **Commands.** Every player action (place road, paint zone, place building, bulldoze, set tax, take loan, enact policy and so on) is a command sent to the sim. The UI, tests, debug panel and replays all use the same command path, which also makes undo straightforward.
- **Deterministic.** Seeded RNG and a fixed-timestep tick independent of frame rate. The same seed plus the same command list must produce the same state; test this with a state hash.
- **Data-driven.** Building types, costs, capacities, unlock thresholds and every balancing number live in typed config in `src/data`, not scattered through the logic.
- **Roads are a graph** of nodes and segments, straight or curved. Pathfinding, utility delivery and service coverage all run on this graph.
- **Rendering at scale:** instancing and/or chunked merged geometry, LOD and frustum culling, with no per-frame allocations in hot paths.
- **Saves:** versioned JSON (compressed if large) in IndexedDB, with multiple slots, autosave, export/import to a file, and migrations whenever the format changes.
- **Dev tooling:** a debug panel (toggled with the backtick key) showing FPS, sim tick time and entity counts, plus cheats (add money, unlock everything, trigger any disaster, fast-forward). In dev and test builds, expose `window.__game` with `dispatch(command)`, `getState()`, `advance(ticks)` and `setCamera(preset)` so Playwright can drive and photograph the game.
- Keep modules focused and code readable. Refactor when something gets unwieldy, but don't build for needs the spec doesn't have. Suggested top-level layout: `src/sim`, `src/render`, `src/ui`, `src/data`, `tests/`, `e2e/`, `docs/`.

## 5. Game design

### World
- Procedurally generated terrain from a seed: flat land and hills, a river or coastline, forests, and underground resources (groundwater, ore, oil) shown on data maps.
- A buildable area of about 2 × 2 km with scenery beyond it. A regional highway connection at the map edge brings in the first residents and carries goods in and out.
- New-game options: seed or map preset, difficulty, sandbox mode (unlimited money, everything unlocked) and disasters on or off.

### Roads
- Road types with different cost, upkeep, traffic capacity and maximum zone density: dirt road (low density), street (up to medium) and avenue (up to high), plus a higher-capacity type unlocked later. Upgrading a road keeps what's built along it wherever possible.
- Click-and-drag drawing of straight and free-form curved roads, with snapping (grid, existing roads, angles), automatic intersections, a live cost preview and a clear invalid-placement state.
- Terrain-aware: roads follow gentle slopes and can't climb cliffs; bridges over water arrive in M6.
- A bulldozer for anything, with partial refunds where sensible.

### Zoning and growth
- Zone cells appear along both sides of every road, straight or curved. The player paints residential, commercial or industrial zoning onto them, or removes it.
- Buildings grow on zoned lots that have demand and road access. Road type caps density, land value sets wealth (low, medium or high), and population milestones unlock higher densities.
- Buildings construct visibly, upgrade when conditions are good, and decline or become abandoned when their needs go unmet. Abandoned buildings drag down nearby land value until they're bulldozed or reoccupied.
- RCI demand, shown as three bars, comes from the economy: residents want jobs, shops and services; shops want customers, workers and goods; industry wants workers and somewhere to send its freight. The player can always see why demand is high or low.

### Money
- A treasury with income (taxes by zone type and wealth level, plus trade and specialisation revenue) and expenses (building upkeep, road maintenance, loan repayments and policies).
- Tax rates per zone type and wealth level. Higher taxes raise money but dampen demand and happiness.
- Department funding sliders (0–150%) that trade cost against effectiveness.
- A budget panel that accounts for every dollar: each income and expense line, projections and history charts.
- Loans with interest and a repayment schedule. Escalating warnings as money runs low, and a real consequence for bankruptcy after a grace period (except in sandbox).
- Policies the player can enact, each with a running cost and a measurable effect, for example free public transport, a home fire-safety program, a recycling scheme or a tourism campaign.

### Utilities
- Power, water and sewage flow through the road network, so there are no separate lines or pipes to draw. Supply is limited by plant capacity.
- Power: several plant types trading cost, output and pollution (e.g. coal, gas, wind and solar, with nuclear unlocked late).
- Water: pumps drawing on groundwater or rivers. Polluted groundwater means a polluted supply.
- Sewage: cheap outflow pipes that pollute, or treatment plants that don't.
- Garbage: landfill, recycling centre and incinerator, with collection trucks driving the roads. Uncollected garbage piles up visibly.
- Shortages are obvious (icons over buildings, advisor alerts) and escalate from unhappiness to closing businesses to abandonment.

### Services
- Fire, police, health (clinic, then hospital), education (primary school, high school, university, library) and parks and plazas. Transit arrives in M6.
- Each service building has a capacity (vehicles, beds, seats) and covers buildings by travel distance along roads, not by straight-line radius.
- Events use real dispatch: fires break out and spread, crimes happen, people fall sick, and vehicles drive there along the roads, so traffic and station placement change response times.

### Residents and happiness
- Residents are aggregated per building (count, wealth, education, employment, health). A sample of visible pedestrians and vehicles carries real trips the player can click to inspect: where from, where to and why.
- Happiness per building comes from explicit factors: utilities, service coverage, commute time, jobs, shopping, pollution, crime, parks and amenities, and taxes. The city's approval rating is the weighted average.
- Happy areas upgrade and attract wealthier residents; unhappy ones decline. Wealthier residents pay more tax but expect better services and cleaner air. That's the core balancing tension.
- Land value comes from services, parks, pollution, crime and neighbours, and it decides which wealth levels move in.
- Clicking a building shows who lives or works there, their happiness breakdown and what they need. A feed of short resident thoughts reflects real conditions ("Third day without water. We're moving out.").

### Traffic and transport
- Commuters travel from homes to jobs and shops along the road graph, with morning and evening rush hours. Model traffic as aggregated flows with congestion per road segment, updated periodically rather than pathfinding every agent every tick, and render a representative number of vehicles following real routes.
- Congestion lengthens commutes, which hurts happiness and business. Better roads, alternative routes and transit relieve it.
- Freight trucks move goods between industry, shops and the highway connection. Service vehicles share the roads and get stuck in traffic too.
- Transit: buses (depot and stops) first, then trams or trains if time allows.

### Environment, health and education
- Air pollution from industry, power plants and traffic drifts with a prevailing wind. Ground pollution comes from industry, sewage and landfill.
- Pollution makes residents sick. Sick residents need clinics and hospitals, and untreated sickness lowers happiness and population.
- Trees and parks reduce pollution nearby and raise land value.
- Education raises the workforce's education level over time, unlocking cleaner, higher-value industry and offices.

### Disasters
- Fires are always on. Optional disasters (earthquake, tornado, flood, meteor strike) occur rarely at random or can be triggered from a disasters menu. Each does visible, sensible damage, emergency services respond, and the city can rebuild.

### Progression and specialisations
- Population milestones unlock new road types, densities, services, specialisations and landmarks, each with a brief celebratory moment.
- Service buildings can be expanded with add-on modules (extra fire engines, more classrooms, extra beds) that raise capacity and upkeep.
- Two or three specialisations with their own buildings and economy, e.g. tourism (original landmarks, hotels, attractions), trade (a freight hub or port) and technology (university-driven high-tech industry).
- A handful of achievements for fun goals.

### Information and feedback
- Top bar: treasury and net income, population, date and time, speed controls (pause, 1×, 2×, 3×), RCI demand and approval rating.
- Data maps with legends: power, water, sewage, garbage, fire, police, health and education coverage, crime, air and ground pollution, land value, wealth, happiness, traffic and natural resources.
- Advisors (finance, utilities, safety, health, education, transport) give timely, specific advice, with a button that flies the camera to the problem.
- Prioritised notifications; clicking one focuses the camera.
- Procedurally generated street and neighbourhood names.

### Controls
- Camera: pan (drag, WASD, optional edge scroll), rotate (right-drag, Q/E) and zoom (wheel) from street level out to the whole map, with smooth easing and sensible limits.
- A bottom toolbar grouped by category, with icons, tooltips showing cost, upkeep and effect, and keyboard shortcuts. Escape cancels; undo reverses the most recent placement.
- Tool feedback: ghost previews, valid/invalid colouring, cost previews and a coverage preview when placing service buildings.

### Game shell
- Main menu (new game, continue, load, settings), pause menu, save/load screens, and settings for graphics quality, shadows, draw distance, UI scale, audio volumes, edge scrolling and disasters.
- An optional short tutorial and contextual tips for a new player's first city.

## 6. Art and audio direction

- A bright, warm, slightly toy-like stylised look: clean low-poly shapes, soft shadows, gentle ambient occlusion and clear, readable colours.
- Build every model procedurally from parameterised parts (walls, floors, roofs, windows, awnings, signage, chimneys) with enough variation that streets never look copy-pasted. Each zone type, density and wealth level gets a distinct look.
- Living details: vehicles, pedestrians at close zoom, smoke from chimneys, construction scaffolding, and a day/night cycle with lit windows and street lights. A subtle, optional tilt-shift blur when zoomed in gives a miniature feel.
- Route all models through an asset registry so procedural models can later be swapped for hand-made glTF models without touching game logic.
- Audio: procedural sound effects via the Web Audio API (build, zone, bulldoze, UI, alerts) and an ambient bed that follows what's on screen (traffic, nature, construction). All original, with volume controls.
- UI: clean, modern and legible, with original SVG icons and colour-blind-friendly palettes on data maps.

## 7. Milestones

Work in order. Each milestone ends playable, fully tested, committed and pushed, with its final commit message starting `M<n> complete:`. Before closing one, re-read its entry here and check every item; anything dropped is either done or explained in `docs/DECISIONS.md`.

**M0 Foundation.** Scaffold and scripts (`dev`, `build`, `test`, `e2e`, `typecheck`, `lint`); sim worker and messaging; command system; seeded RNG; state hash; debug panel; `window.__game`. Terrain, water and trees; camera; lighting and sky. Before building any game systems, write `DESIGN.md`: the architecture (with an ASCII component diagram and the trade-offs you weighed), the data model, and the simulation model (tick rate, demand, growth, economy, utilities, coverage, traffic, happiness, land value), including the formulas and how the systems feed each other. Keep it updated as things change. Create `PROGRESS.md` and `docs/DECISIONS.md`.
*Done when* a generated map renders correctly in screenshots from every camera preset, the camera controls work, and the tests and an e2e smoke test pass.

**M1 Roads and zoning.** Road types; straight and curved drawing with snapping; intersections; costs; bulldozer; zone cells and painting along straight and curved roads; the highway connection.
*Done when* you can build a connected network of straight and curved roads off the highway and zone it, all through the real UI.

**M2 Growth.** RCI demand; buildings growing, upgrading and being abandoned; first procedural buildings; population and jobs; time controls; top bar; building inspector; basic save/load.
*Done when* a town grows from nothing in response to your zoning, and save/load round-trips exactly (matching state hash).

**M3 Money.** Taxes, upkeep, department funding, the budget panel with charts, loans and bankruptcy.
*Done when* the budget accounts for every dollar, tax changes visibly shift demand, and a scenario test can go bankrupt.

**M4 Utilities.** Power, water, sewage and garbage, with their data maps and shortage consequences.
*Done when* cutting a utility visibly hurts the right buildings and scenario tests prove shortages cause decline.

**M5 Services and happiness.** Fire, police, health, education and parks; road-distance coverage; dispatched events; the happiness model; land value and wealth levels; approval rating.
*Done when* coverage visibly follows the roads, vehicles respond to incidents, and every building can explain its mood.

**M6 Traffic and transport.** Commute and freight flows with rush hours; congestion; visible vehicles; traffic data map; buses; road upgrades; bridges.
*Done when* jams form where you'd expect, and a scenario test shows a bypass or bus route measurably cutting commute times.

**M7 Environment, health and education.** Air and ground pollution with wind; sickness, clinics and hospitals; effects of trees and parks; education-driven industry.
*Done when* a polluting district measurably harms health downwind, and cleaner choices measurably help.

**M8 Life and feedback.** Advisors, notifications, resident thoughts, the full set of data maps, street names, day/night lighting, construction animation, audio, and a building-variety pass.
*Done when* a new player could work out what's wrong with their city from advisors and data maps alone, and night-time looks great.

**M9 Disasters.** Fire spread, earthquake, tornado, flood and meteor strike; emergency response; recovery.
*Done when* each disaster can be triggered, plays out visibly, damages the right things, and the city can recover.

**M10 Progression and specialisations.** Unlocks, service modules, policies, specialisations, landmarks and achievements.
*Done when* growing from village to 100k residents brings regular unlocks, and specialisations and policies have measurable effects.

**M11 Game shell.** Main and pause menus, new-game options, settings, save slots, autosave, export/import and the tutorial.
*Done when* main menu → new game → save → quit → reload → continue works flawlessly and settings persist.

**M12 Balance, performance and polish.** Balance tuning, performance at scale, a bug bash and a final review against this whole spec.
*Done when* balance runs show a healthy difficulty curve, sim tick time stays within budget at 100k residents (with the frame-rate check listed in PROGRESS.md for me to confirm on real hardware), a long soak test produces zero console errors, and every item in this spec is either done or explained in `docs/DECISIONS.md`.

## 8. Verification

Follow the usual test pyramid: many fast unit tests, a solid set of scenario tests, and a few focused end-to-end tests.

- **Unit tests** (Vitest) for simulation logic: demand, growth rules, economy (income minus expenses equals the change in treasury, exactly), coverage, pathfinding, happiness, save/load round-trips and determinism.
- **Scenario tests:** scripted cities built through commands and run headlessly for years of game time, asserting outcomes. A well-served town grows; a town without power declines; high taxes cut demand; congestion rises with population and falls when relief is built. In test mode, check invariants every tick: no NaN or Infinity, no negative populations or capacities, nothing outside the map, and money that always balances.
- **End-to-end tests** (Playwright): launch the game, build a small town through the real UI (not only the test API), run time, open the main panels, and take screenshots from fixed camera presets (overview, street level, night, a data map). Fail on any console error or unhandled promise rejection.
- **Look at the screenshots** after every visual change and critique them against the art direction: z-fighting, floating or clipped buildings, roads that don't sit on the terrain, broken lighting, unreadable or overlapping UI. Fix what you find. Keep the latest set in `docs/screenshots/`.
- **Performance:** a benchmark that generates a large city through the test API and records frame time and sim tick time. Log the numbers in `PROGRESS.md` at the end of each milestone. Cloud sessions have no GPU, so frame times there are meaningless: track sim tick time, draw calls and triangle counts instead, and list anything that needs a real-hardware check in `PROGRESS.md` for me to run.
- **Balance tool:** a headless script that plays scripted strategies (careful, greedy, neglectful) for 20+ game years and prints curves for population, treasury, approval and demand. Tune `src/data` until a sensible player sees steady growth with real trade-offs and a careless one gets into trouble.

A milestone is finished only when typecheck, lint, unit, scenario and e2e tests all pass, the screenshots have been reviewed, `PROGRESS.md` is updated, and the work is committed and pushed.

## 9. When every milestone is done

Do a final playthrough via tests and screenshots, fix the rough edges, write a README covering how to run, build and play, and put a summary of the game's state and ideas for what to build next at the top of `PROGRESS.md`. If there's still room to go further: neighbouring cities that trade, trams and trains, more specialisations, weather and seasons, and support for custom glTF models.
