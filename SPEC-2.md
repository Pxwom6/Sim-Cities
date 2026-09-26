# SPEC-2.md: Citybloom phase 2

Phase 1 (SPEC.md, M0–M12) is complete. This brief adds milestones M13–M24, based on my own playthrough and the features I want next. SPEC.md still applies in full: originality (section 2), stack and architecture (sections 3–4) and verification (section 8). Where this brief is silent, use your judgment as a game designer and log the call in `docs/DECISIONS.md`.

## Rules for all of phase 2

- Work in order. Each milestone should be worth having on its own, because I may pause between them.
- Every milestone ends playable, tested through the real UI with screenshots reviewed, committed and pushed, with a final commit message starting `M<n> complete:`.
- New saved state bumps the save version with a migration, and a test proves saves from before the change still load and play on.
- Keep the M12 performance budget: at ~100k residents, sim tick average under 1 ms and worst under 15 ms, and overview draw calls near M12's 288. Rerun `bench` and `balance` at the end of every milestone and log the numbers in PROGRESS.md.
- Everything new is original: names, building designs, icons and sounds.
- Keep the player informed: new tools get tooltips, shortcuts, tutorial tips and advisor hints where they help, and new systems get data maps or inspector lines wherever a player would ask "why?".
- Update the README (controls and features) and add a section for this brief to `docs/SPEC_REVIEW.md`.
- Anything that needs real hardware to judge goes under "To check on the Mac" in PROGRESS.md.
- When a later milestone adds a system, add or update a scenario (M18) that shows it off.

## Milestones

**M13 Gentler roads.** Roads are rejected as "too steep" on quite ordinary hills. They drape over the terrain with a 12 % limit measured over 16 m (DECISIONS M1), so any short bump fails. Grade roads the way a real road builder would:
- Give each road a smoothed vertical profile, and cut and fill the terrain under it and a little to each side, with visible embankments and cuttings. Measure grade on the smoothed profile, not the raw terrain.
- Set grade limits per road type closer to real practice (steeper allowed for streets than for boulevards), so a street goes over an ordinary hill without complaint. Only genuinely extreme ground should fail. Where fill would be very tall, offer a bridge over dry ground as well as water.
- Earthworks cost money in proportion to the volume moved, so steep routes become a trade-off rather than a wall.
- The road preview shows the grade along the ghost, colours any section that's too steep, and says by how much and what would fix it.
- Save terrain edits as deltas on top of the seed (terrain is regenerated on load); M24's terrain tools will reuse them. Nearby zone cells, buildings and trees adapt, and nothing floats or sinks.
- Existing saves load unchanged.
*Done when* a sampled test of random street placements across all map presets shows rejections only on truly extreme ground (report the numbers before and after), and screenshots show clean embankments and cuttings with buildings sitting properly beside them.

**M14 Controls and editing.**
- Trackpad support: a two-finger swipe pans, pinch zooms, and a modifier key with a two-finger swipe (or Safari's rotate gesture) rotates and tilts. Detect trackpad or mouse automatically, with a setting to override. Existing mouse and keyboard controls stay as they are. Shortcuts use Cmd on macOS (Ctrl elsewhere).
- Undo and redo for the last ~30 actions, now including bulldozing (roads, civic and zoned buildings restored as they were, with their modules), zoning and dezoning, road upgrades and moves. Where an action can no longer be undone cleanly, say why in a toast.
- Move buildings: civic buildings, landmarks and specialisation buildings can be picked up and put down anywhere valid for a small fee, keeping their modules, funding and upgrades.
- A shortcut cheat sheet on `?`.
*Done when* e2e tests pan, zoom and rotate with synthesized trackpad events, undo and redo a bulldoze and a zoning stroke exactly (matching state hash), and move a building.

**M15 Publish it.**
- Deploy the production build to GitHub Pages with a GitHub Actions workflow that runs on pushes to main, with the right Vite base path. If you can't push a workflow file from this session, put it in `docs/deploy/` and tell me where it goes.
- Make it an installable app that works offline: a web app manifest, original icons, and a service worker that caches the game and offers "New version, reload" after a deploy. Saves survive updates.
- A link that previews well when shared: title, description, and a social preview image made from a game screenshot.
- On first launch, pick a graphics preset from a quick performance check, so weaker laptops start on a lighter setting.
- Correct the README's claim that every resident is simulated: residents are aggregated per building.
- Put exactly what I need to click (e.g. turning on Pages) at the top of PROGRESS.md.
*Done when* a production build served from a subpath passes the e2e suite, works offline after one visit, and detects and applies an update.

**M16 Photo mode and city history.**
- Photo mode: hide all UI; a free camera that can go lower and closer than normal; controls for time of day, tilt-shift and depth-of-field strength, and field of view; a few colour grades; a follow camera that rides with a car, bus or walker; save a PNG at up to twice screen resolution. The city can pause or keep running.
- City history: record key stats over the city's whole life (population, approval, jobs and unemployment, treasury, income and spending, pollution, crime, traffic), downsampled so saves stay small. A City history panel charts them in the budget's style and marks milestones and disasters on the timeline. Older saves start their history when loaded.
*Done when* photo mode saves a full-resolution PNG with no UI in it, and history survives save/load exactly.

**M17 Big projects and elections.** The late game needs goals and somewhere to spend the surplus.
- Four to six original big projects: expensive, multi-stage builds that take months of game time. Each has requirements (population, education, a specialisation or resources), visible construction stages and a lasting perk. Examples: a stadium whose match days draw visitors and spike traffic, a space launch site for a technology city, a clean-energy megaplant, a world expo.
- Elections every four game years, decided mainly by approval. Beforehand the mayor can make one or two promises (e.g. cut crime by a fifth, open a hospital) that voters then judge. Winning brings a perk. Losing never ends the game but brings a year of limits (e.g. a council that blocks tax rises). Elections are off in sandbox, with a setting to turn them off.
- Extend the balance tool's careful mayor so it plans across the whole map and grows past 50k residents on its own. Then retune the late-game economy so projects, landmarks and specialisations soak up the surplus without making the early and mid game any tighter.
*Done when* the careful mayor passes 50k, completes a big project and wins an election in the balance run, and its late-game money curve shows spending goals being met rather than an ever-growing pile.

**M18 Scenarios.**
- Six to eight scenarios, each a fixed map and starting city with goals, limits and a time limit. Examples: reach 10k without coal, rescue a bankrupt city, rebuild after a flood, fix gridlock, clean up a polluted industrial town, grow a tourist resort.
- A scenario screen from the main menu with a description and preview of each; a win screen with one to three stars; progress kept per device.
- Scenarios are data-driven (`src/data`), and their starting cities are saves.
*Done when* a scripted player in the test suite wins each scenario and a neglectful one loses it.

**M19 Traffic tools.**
- One-way streets, drawn with a direction and switchable on existing roads.
- Roundabouts, placed on a junction or drawn as a ring, with their own capacity in the traffic model.
- A city highway road type: high capacity, no zoning, joined to other roads only by on- and off-ramps, passing over or under the roads it crosses, with an interchange onto the regional highway. Build the grade separation so rail can reuse it in M20.
- Visible cars follow each other, queue and give way at junctions, so jams and roundabouts look right, within the performance budget.
- The traffic data map shows direction and ramps.
*Done when* scenario tests show a roundabout measurably relieving a jammed junction, and a highway bypass taking through traffic off local streets.

**M20 Rail.**
- Trams on streets, avenues and boulevards (track added to an existing road), with stops and a depot.
- Trains on their own track with stations. They cross roads on bridges or at level crossings, on gentle grades, using M13's grading and M19's grade separation.
- Mode choice adds tram and train alongside car, bus and walking, with a ridership data map and line and stop inspectors.
- Freight rail: a regional rail connection at the map edge and a freight terminal that serves industry and the trade specialisation, taking trucks off the roads.
- Animated trams and trains.
*Done when* scenario tests show a train line measurably cutting car traffic on a jammed corridor, and freight rail cutting truck traffic.

**M21 Districts.**
- Paint named districts; the generated neighbourhood names stay as defaults.
- Most policies can apply to one district instead of the whole city, with costs scaled to it. Add a few district-only policies, e.g. a heavy-traffic ban, a high-rise ban, and a heritage district where buildings don't change.
- A district panel with population, jobs, happiness, land value and its share of the budget; data maps can be filtered to one district.
*Done when* a district policy measurably changes its own district and not the rest of the city.

**M22 Seasons and weather.**
- Seasons across the year (a season is three day/night cycles on the compressed calendar): autumn colours, bare trees and snow in winter, spring blossom.
- Weather: rain, snow, fog, storms and heatwaves, with particles, wet roads, clouds, lighting and sound, within the performance budget.
- Effects: heating raises power demand in winter; heatwaves raise power and water demand; snow slows traffic until ploughed (a new public works depot sends out ploughs); heavy rain raises rivers and flood risk; dry spells lower groundwater and pump output; parks are used less in the rain.
- Settings for seasons on or off and weather intensity. Map presets can have their own climates. Photo mode gets season and weather controls.
*Done when* scenario tests show winter power demand and snow slowdowns, and screenshots of every season and weather type have been reviewed.

**M23 Region, airport and seaport.**
- Two or three simulated neighbouring cities beyond the map edges, each with a character (e.g. an industrial town, a resort, a commuter suburb), growing or shrinking over time. The player can make deals to buy or sell power, water and garbage processing. Commuters and shoppers travel between cities by highway and rail, and the inspector and data maps show where they come from. This deliberately reverses the M2 decision against regional commuters, so keep it readable.
- An airport: a big footprint, unlocked by population, boosting tourism and business, with a new noise data map and visible planes.
- A seaport on maps with deep water, boosting freight and trade, with visible ships.
- Visitors now arrive by highway, rail, airport and seaport and travel through the traffic model, closing the M10 gap.
*Done when* scenario tests show a power deal covering a shortage, regional commuters filling jobs, and the airport raising visitor numbers.

**M24 Terrain and map editor.**
- In-game terraforming tools (raise, lower, level, smooth) built on M13's terrain deltas, with a cost per volume, limits near buildings, and undo.
- A map editor from the main menu: sculpt terrain, paint water (rivers, lakes, coastline), and place resources, forests and the highway and rail entries. Before saving, it checks the map is playable (a buildable start area by the highway). Maps save and share as files and appear on the new-city screen.
*Done when* a map made in the editor saves, reloads, and grows a city in a scripted test.

## When every milestone is done

Update the summary and ideas at the top of PROGRESS.md, finish this brief's section in `docs/SPEC_REVIEW.md`, and do a final playthrough through the real UI that uses the new features.
