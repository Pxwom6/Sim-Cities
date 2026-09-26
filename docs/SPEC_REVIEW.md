# Review against SPEC.md (M12)

Every item in the brief, where it lives, and how it's checked. "e2e mN" is `e2e/mN-*.spec.ts`, and
screenshots are in `docs/screenshots/`. Anything not done is explained at the end and in
`docs/DECISIONS.md`.

## 2. Originality
| Item | Status |
|---|---|
| Original title in one constant | Done: `GAME_TITLE = 'Citybloom'` in `src/config.ts` |
| No SimCity/EA/Maxis names, art, text or sounds | Done: all models, icons and audio are generated in code |
| Third-party licences recorded | Done: `CREDITS.md` (three.js, Preact, fflate: MIT) |

## 3. Platform and stack
| Item | Status |
|---|---|
| TypeScript strict, Vite, Three.js, Vitest, Playwright, ESLint, Prettier | Done |
| WebGL2, HTML/CSS UI over the canvas, design tokens as custom properties | Done: Preact, `src/ui/styles/tokens.css` |
| 60 fps at ~100k residents; no hitches at top speed | Sim side met (`bench.ts --big`: avg 0.6–0.8 ms, worst 9–14 ms per tick); render side at 288 draw calls. The frame rate itself needs the Mac check (PROGRESS.md) |

## 4. Architecture
| Item | Status |
|---|---|
| Pure sim in a Web Worker, typed messages, compact diffs, vehicles animated on the main thread | Done: `src/sim/worker.ts`, `FrameDiff`, ESLint bans DOM/Three/`Math.random`/`Date` in `src/sim` |
| Every action is a command (UI, tests, debug, replays); undo | Done: `src/sim/commands.ts`; undo tested (unit) and in the toolbar |
| Deterministic: seed + commands → same state hash | Done: replay and save/load hash tests (unit, e2e m2, m11) |
| Data-driven balancing | Done: `src/data/*` |
| Road graph, straight and curved | Done: `src/sim/world/network.ts` |
| Instancing/chunked merged geometry, LOD, frustum culling, no per-frame allocations | Done: chunk-merged buildings (256 m), civics (512 m), roads and zones (512 m); instanced trees/vehicles/walkers with LOD; terrain chunks |
| Saves: versioned, compressed, IndexedDB, slots, autosave, export/import, migrations | Done: `src/sim/save.ts` (version 9, migrations), `src/client/saves.ts`; e2e m11 |
| Debug panel (backtick): FPS, tick time, counts; cheats (money, unlock all, disasters, fast-forward) | Done: `src/ui/DebugPanel.tsx` |
| `window.__game` with dispatch/getState/advance/setCamera | Done: `src/client/testApi.ts` |

## 5. Game design
| Area | Status |
|---|---|
| World: seeded terrain, hills, river/coast/lakes, forests, groundwater/ore/oil on data maps; 2×2 km with scenery; highway | Done (M0, M4, M10) |
| New-game options: seed/preset, difficulty, sandbox, disasters | Done (M11): new-city screen |
| Roads: dirt/street/avenue + boulevard, upgrades keep buildings, drag drawing with curves, snapping, intersections, cost preview, invalid state, slope limits, bridges, bulldozer with refunds | Done (M1, M6); e2e m1, m6 |
| Zoning and growth: cells on both sides, RCI painting, density by road and milestones, wealth by land value, construction, upgrades, decline, abandonment, RCI bars with reasons | Done (M1, M2, M10); e2e m1, m2 |
| Money: taxes by zone and wealth, funding sliders, budget panel with history, loans, warnings, bankruptcy, policies | Done (M3, M10); ledger balances to the dollar (unit); e2e m3, m10 |
| Utilities: power (coal, gas, wind, solar, nuclear), water (pumps, river pumps, polluted supply), sewage (septic tanks, outflow, treatment), garbage (landfill, recycling, incinerator, trucks, visible piles), escalating shortages | Done (M4, M12 septic); e2e m4 |
| Services: fire, police, clinic/hospital, primary/high school/university/library, parks and plazas; coverage by road travel; real dispatch | Done (M5); e2e m5 |
| Residents: aggregated per building; clickable pedestrians and cars with real trips; happiness factors; approval; land value; inspector; thoughts feed | Done (M5, M6, M8); e2e m2, m6, m8 |
| Traffic: commuting with rush hours, congestion per segment, freight trucks, service vehicles in traffic, buses | Done (M6); e2e m6 |
| Environment: wind-borne air pollution, ground pollution, sickness and care, trees and parks, education raising industry | Done (M7); e2e m7 |
| Disasters: fires always; earthquake, tornado, flood, meteor, random or from the menu; damage, response, rebuilding | Done (M9); e2e m9 |
| Progression: milestones with celebration, modules, three specialisations, landmarks, achievements | Done (M10); e2e m10 |
| Information: top bar, 16 data maps with legends, advisors with "show me", notifications, street and neighbourhood names | Done (M3–M8) |
| Controls: camera (drag, WASD, edge scroll, Q/E, wheel), toolbar with tooltips and shortcuts, Escape, undo, ghosts and coverage preview | Done (M0, M1, M5, M11) |
| Game shell: main and pause menus, save/load screens, settings (graphics quality, shadows, draw distance, UI scale, volumes, edge scrolling, disasters), tutorial and tips | Done (M11); e2e m11 |

## 6. Art and audio
| Item | Status |
|---|---|
| Bright, warm, low-poly look; soft shadows | Done (M0–M8) |
| Procedural models from parts, distinct per zone/density/wealth | Done: `src/render/assets/*`; `scripts/dev/gallery.mjs` |
| Vehicles, pedestrians, smoke, scaffolding, day/night with lit windows and street lights, tilt-shift | Done (M6, M8); e2e m8 |
| Asset registry for future glTF | Done: `src/render/assets/registry.ts` |
| Procedural sound effects and ambient bed with volume controls | Done (M8); e2e m8 renders every sound offline |
| Original SVG icons, colour-blind-friendly data-map ramps | Done: `src/ui/icons.tsx`, `src/client/overlay.ts` |

## 8. Verification
| Item | Status |
|---|---|
| Unit tests for demand, growth, economy (to the dollar), coverage, pathfinding, happiness, saves, determinism | Done: `tests/` (19 files) |
| Scenario tests (served town grows, no power declines, taxes cut demand, congestion rises and relief works); invariants every tick in test mode | Done: `tests/*` with `sim.testMode`; balance runs with `--invariants` |
| e2e through the real UI with screenshots, failing on console errors | Done: `e2e/` (15 tests) |
| Screenshots reviewed | Done each milestone; latest in `docs/screenshots/` |
| Performance benchmark | Done: `scripts/bench.ts` (and `--big` for ~100k) |
| Balance tool: careful / greedy / neglectful for 20+ years | Done: `scripts/balance.ts` |
| Long soak with zero console errors | Done: `npm run soak` (10 minutes of top-speed play with disasters, panels, maps, saves) |

## Not done, and why
- **Trams and trains** (§5 transport, "if time allows") and the §9 extras (neighbouring cities, weather
  and seasons, more specialisations, glTF models) weren't built; the time went on depth and polish in
  the required systems. The asset registry and the transit system (lines, stops, riders) are where
  they would plug in. Listed as next steps at the top of PROGRESS.md.
- **Visitors in traffic** (M10): tourists are counted, spend and shop, but don't drive through the
  traffic model.
- **Render triangle budget**: 2.5M at the whole-city overview of a 100k city (half of it the shadow
  pass) against an early 1.5M target; draw calls are within budget. Flagged for the Mac check.
