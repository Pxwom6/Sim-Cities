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
