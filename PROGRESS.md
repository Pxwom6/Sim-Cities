# PROGRESS

- [x] M0 Foundation
- [ ] M1 Roads and zoning
- [ ] M2 Growth
- [ ] M3 Money
- [ ] M4 Utilities
- [ ] M5 Services and happiness
- [ ] M6 Traffic and transport
- [ ] M7 Environment, health and education
- [ ] M8 Life and feedback
- [ ] M9 Disasters
- [ ] M10 Progression and specialisations
- [ ] M11 Game shell
- [ ] M12 Balance, performance and polish

## In progress
M1 Roads and zoning (not started).

## Next tasks
1. Road graph in the sim: nodes, quadratic-Bézier segments, road types in `src/data/roads.ts`, planning (snap, split, validate, cost) and `buildRoad` / `bulldoze` / `undo` commands.
2. Highway connection segment at the west edge (connectZ from terrain params).
3. Road rendering (ribbons + intersections draped on terrain), ghost preview with valid/invalid colour and cost label.
4. Zone blocks and cells along both sides of each segment; `zone` command (brush + fill); zone rendering.
5. Bottom toolbar with road/zone/bulldoze tools; e2e that builds straight + curved roads and zones them through the real UI.

## Known issues
- Night lighting is serviceable but plain until M8 (lit windows, street lights).
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M0, cloud VM, SwiftShader)
- Sim tick: negligible (no systems yet).
- Overview preset: 108 draw calls, ~675k triangles (trees dominate). Street preset: ~40 calls, ~510k triangles.
- Frame times on SwiftShader are meaningless (several seconds per frame).

## To check on the Mac
- Frame rate while panning the overview and street presets (expect 60 fps; M0 has no city yet).
