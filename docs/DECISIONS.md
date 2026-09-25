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
