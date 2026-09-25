# Decisions

One line each: what was decided and why. Newest at the bottom of each section.

## M0
- Working title **Citybloom** (`GAME_TITLE` in `src/config.ts`): original, warm, no genre trademark.
- TypeScript 6.0 rather than 7.0: typescript-eslint supports TS < 6.1 only.
- @playwright/test pinned to 1.56.x to match the pre-installed Chromium 141 (build 1194) in the cloud VM.
- Compressed calendar: one day/night cycle is one calendar month (1440 one-minute ticks), so lighting, rush hours and the monthly budget share one clock and 20 game years stay playable.
- Speeds 1×/2×/3× = 8/16/24 ticks per second (a month takes 3 / 1.5 / 1 minute).
- Preact for the UI: tiny, JSX, hooks; panels like the budget and inspector would be painful in raw DOM.
- Buildings are chunk-merged rather than instanced, because procedural variety makes too many distinct models for instancing to pay off.
- Traffic is an aggregated assignment that also performs job/shop matching, so employment depends on the real road network.

## M1
- Roads are quadratic Béziers; free-form strokes are fitted with a chain of ~48 m quadratics.
- Roads drape over the terrain (no terrain flattening); max grade 12 % over 16 m, min curve radius 18 m, min junction angle 28°.
- Crossing an existing road splits both at the crossing; ending on a road makes a T-junction. Crossing the regional highway is not allowed.
- Water blocks roads until bridges arrive in M6.
- Zone cells are 8 m squares, 4 rows deep on both sides of every road; overlaps resolve by priority (occupied, then lower row, older road, lower column). Cells that become invalid lose their zoning.
- Zone painting only changes empty cells: existing buildings keep their cells until bulldozed, so a stray brush stroke never destroys a neighbourhood.
- A brush drag is one undo step (commands carry a stroke id and the sim merges them).
- Bulldozing a road refunds 25 %; undo refunds 100 % and re-merges roads it split. Undo covers placements only (spec).
- Removing a road removes its zone blocks; buildings on them are demolished (shown in the bulldoze preview from M2).
- Snapping (nodes, roads, 45° steps relative to world axes and existing roads, optional 8 m grid) happens on the client for responsiveness; the sim re-validates every command.
- Keyboard: T roads, Z/X/C/V zones (R/C/I/dezone), B bulldoze, H or Esc select, Tab road mode, G grid, [ ] brush size, Ctrl+Z or U undo. WASD/QE/RF/+− stay on the camera.
- Save format stays at version 1 until M2 introduces real save/load; from then on every format change bumps the version with a migration.

## M2
- Buildings are archetypes by zone × density × wealth × level (`src/data/buildings.ts`); density is set by the road type and population unlocks (medium at 800, high at 5,000), wealth by land value.
- If a bigger footprint doesn't fit when upgrading, the building rebuilds in place on its lot (capacity scales with lot area), so packed streets still upgrade.
- Employment and shopping come from one nearest-first matcher over the road graph (DESIGN §3.8), so jobs need a road connection. Residents from outside the city don't commute in (no regional commuters) to keep the loop readable.
- New residents aren't counted as unemployed until the next matching round (avoids a move-in/move-out flicker).
- Upgrades need mood ≥ 0.62, occupancy ≥ 88 % for 3 hours and positive demand for that zone. 0.62 is reachable before services exist; revisit once services add positive factors (M5/M12).
- High wealth can't move in until services exist (M5); M2 caps wealth at medium.
- Industry "wealth" is the industry tier (heavy, manufacturing, high-tech); M2 grows heavy industry only (education drives tiers in M7).
- Growth needs the lot's road to be connected to the highway; cut-off buildings gain distress twice as fast and are abandoned within about a day.
- Demolishing zoned buildings is free (no cost, no refund).
- Loading a save reloads the page into `?load=<slot>`; this keeps the renderer's setup path single and robust.
- Saves are gzip-compressed JSON in IndexedDB; exports use the same bytes with a `.citybloom` extension.

## M3
- Money is integer dollars. Hourly accruals carry their fractional remainder per ledger category, so `treasury = month-start treasury + Σ ledger lines` holds exactly every tick (checked in test mode).
- A month is one day/night cycle, so monthly rates accrue in 24 hourly steps; the budget closes at midnight and keeps 24 months of history.
- Loans are annuities paid hourly (interest first); up to 3 at once; early repayment settles the balance. Bigger loans unlock with population.
- Bankruptcy: the treasury may be negative for 48 hours (two months); then the city is bankrupt, the sim stops and every command is refused. Sandbox never goes bankrupt.
- Low-money warning when the monthly net is negative and the treasury covers less than three months of it.
- Tax changes affect demand (average rate per zone), spawn chance per wealth level, and each building's mood (weighted by wealth sensitivity).
- Department funding scales upkeep linearly; effectiveness follows `f ≤ 1 ? f : 1 + ½(f − 1)`. Road maintenance funding only scales cost until traffic (M6) uses it for road wear.
- Policies are listed under Money in the spec but built in M10 with progression; the ledger already has a `policies` line.
- Budget charts use two single-axis charts (treasury line, net-income bars in the diverging blue/red poles), never a dual axis.
- Save format v2 adds the economy; `migrations[1]` upgrades v1 saves with default taxes and funding (tested).

## M4
- Service vehicles move at a visual speed (0.2 m per tick per m/s of road speed), not at real speed in game time; incident timings are tuned in ticks to match (DESIGN §3.7).
- Civic buildings are placed beside a road, facing it, sliding along it with the cursor; the sim validates road frontage, water, slope, overlaps, unlocks and money. Zoned buildings in the way are demolished (shown in the preview).
- Utilities go to consumers in order of road distance from the nearest producer, per connected network; with too little capacity the far end goes dark first.
- Consumption follows capacity (not occupancy) so supply needs don't swing with move-ins.
- Businesses close after 12 hours without power or water and reopen when both return; homes don't close but their mood drops (-28 % each for power and water, -15 % for sewage), which leads to abandonment within about two days.
- A pump draws polluted water when ground pollution under it exceeds 0.25; its share of the network's water is "polluted" for every building on that network (sickness arrives in M7).
- Garbage accumulates per building; trucks go to the fullest buildings within reach and also empty neighbours within 48 m. Landfills fill up; recycling earns trade revenue; incinerators turn yesterday's burn into power.
- Bulldozing a civic building refunds 25 %; undo refunds 100 %.
- Data maps mute the scene and paint values with the reference data-viz ramps: diverging red–grey–blue for supply (bad→good), sequential blue for amounts. A legend names both ends.
- Problem icons are one Points draw call with a canvas-drawn atlas; one icon per building, most urgent first.

## M5
- Coverage is sampled every 24 m along each road (not only at junctions), so it fades smoothly along long streets; buildings read it at their frontage and the data maps tint the roads themselves.
- Service ranges are travel seconds at free-flow speed: a fire station fully covers ~300 m of street and fades out by ~600 m, so a mid-sized town needs several stations. Parks reach only a block or two.
- The coverage table is cached and dropped whenever roads, service buildings or funding change, keeping it a pure function of saved state (exact reloads mid-hour).
- Buildings without power or water (below half) now gain distress whatever their mood: services had made towns happy enough to shrug off a blackout, which isn't believable.
- In-place upgrades don't use up new-building construction slots; otherwise a happy town stopped spreading while it upgraded.
- Garbage trucks carry 90 units (was 60): one landfill now serves about 2,500 residents.
- Fire engines lower intensity by 0.012 per tick at the scene, so a fire caught early is out in about an hour; unanswered fires burn for ~16 hours before collapsing into rubble, which clears after 36 hours.
- Crimes and emergencies are incidents with a response window (7 h and 10 h); only unanswered ones raise the crime map or cost a life, so police and ambulances matter through response time.
- Health capacity (beds) is shown only once sickness exists (M7); in M5 clinics and hospitals provide coverage and ambulances.
- Wealth level 2 needs fire, police and health coverage ≥ 0.4 at the lot; wealthier homes weigh missing services 1.5× (low wealth 0.6×).
- The inspector lists up to three "would help" suggestions drawn from a building's worst mood factors.
- A debug/test `ignite` cheat starts a fire in a building; M9's disasters menu builds on it.
- Toasts move left of the inspector while it's open so they never cover it.
- Data maps are lit as midday whatever the clock, so they stay readable at night.

## M6
- Traffic volumes are part of the saved state (daily PCU per segment), updated every matcher round by successive averages with step 0.2: 0.35 flip-flopped between routes; 0.2 settles within a game day.
- The day is compressed: 25 % of a day's traffic falls in the rush hour, so small towns flow and towns of a few thousand jam at bottlenecks.
- BPR alone made a jammed 120 m link cost seconds; an oversaturated road also adds the average queue wait (up to 10 minutes × (1 − c/v)), which is what makes a bottleneck hurt.
- Coverage maps stay on free-flow times (stable, cacheable); real responses are slowed by traffic via the vehicles' congested speeds.
- Visible traffic is client-only and non-deterministic: it samples real sim trips but never feeds back. Trip samples aren't saved; after loading, cars reappear at the next assignment round (≤ 2 game hours).
- Freight imports and exports always succeed through a connected highway; goods shortages don't yet affect shops (possible M10 trade specialisation hook).
- Road upgrades cost the difference between the two road types (downgrades are free, no refund) and keep buildings by keeping cell indices; buildings are lost only where the new width leaves no room.
- Bridges need at least a street, span at most 360 m and need ~68 m of dry land at each end for ramps; roads can't meet on a bridge.
- Buses follow SimCity 2013: a depot plus stops, no hand-drawn lines. Each depot runs one loop through the stops it reaches first, visiting them nearest-first. Commuters choose by door-to-door time with a 300 s car-hassle allowance; shopping trips stay by car.
- Road unlocks (boulevards at 20k) are now enforced by the sim as well as the UI.

## M7
- The wind is a pure function of the seed and the tick (a prevailing direction with a seasonal wobble), so it needs no saved state and the renderer's smoke drifts the same way as the sim's pollution.
- Sickness is aggregated per home as a fractional count (no individual residents); deaths come off the population as whole residents, the fraction by chance.
- Hospital and clinic "beds" use the M5 capacity field; beds go to the nearest sick first, like school seats.
- Education is an average level per home rather than per-resident degrees; the shares at each level are read off the average. This keeps saves small and still lets schooling visibly move industry up the tiers.
- Industry retools to the tier the workforce supports without needing the usual upgrade conditions (2 % chance per building per hour): tiers track education, not mood.
- Trees and parks absorb air pollution; there's no tree-planting tool (SimCity 2013 had none either) — parks are the player's lever.
- Unprotected fires spread much less than in M5 (spread chance 0.06 → 0.02 per 30 ticks, collapse after 450 ticks instead of 700): the e2e screenshots showed whole streets burning in towns without a fire station.
- The air pollution map shows values ×2.5 so that the thin but harmful downwind plume (0.05–0.2) is visible.

## M8
- Advisors are pure queries over the sim state every 2 s rather than saved state: nothing to migrate, and they can never disagree with the data maps they point at.
- Only the first new urgent advice of a refresh pops up as a toast; the rest go straight to the notification log. The first e2e screenshot showed three red toasts about power, water and sewage at once.
- Resident thoughts are chosen by hashing building ids with the game hour, not with the sim RNG, so asking for them can't change the simulation.
- Street names live only on the client (derived from segment ids); a save doesn't need them and they come out the same on every load.
- Audio is not positional: at city scale the mix already follows the view, and panning individual sources would cost more than it adds.
- Pedestrians walk the sim's sampled short trips, but those trips are still counted as car trips on the roads; the walkers are a visible sample, not a separate travel mode. A walking mode share is a possible M12 refinement.
- Tilt-shift works on the finished frame (copy + two blur passes) instead of an EffectComposer chain, so the tone-mapped look and the custom shaders (sky, water, lamp pools, smoke) stay identical with it on or off. It's off by default.
- Player settings (volumes, mute, tilt-shift) live in localStorage, per device rather than per city; M11 adds the rest to the same record.
- Street-lamp light is faked with additive quads (with polygon offset so they survive at distance) rather than real lights, which would multiply the lighting cost per lamp.
- The variety pass adds about 45 % more triangles to a low-density home (93 → 139 on average) for gardens, trees and cars; mid and high density are almost unchanged, and those dominate big cities.
