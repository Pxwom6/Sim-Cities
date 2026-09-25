# PROGRESS

- [x] M0 Foundation
- [x] M1 Roads and zoning
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
M2 Growth (not started).

## Next tasks
1. Building data (`src/data/buildings.ts`): zoned archetypes by zone × density × wealth × level, footprints in cells, capacity, build time.
2. Demand system (DESIGN §3.3) with named factors; employment/commute matcher stub (full traffic in M6) so jobs need a road connection.
3. Growth system: lots, spawning, construction, occupancy, upgrades, abandonment; buildings clear trees; roads over zoned buildings demolish them.
4. Procedural building models + asset registry + chunk-merged building renderer with construction scaffolding.
5. Top bar (RCI, population, jobs), time controls, building inspector, basic save/load (IndexedDB + file) with state-hash round-trip test.

## Known issues
- Night lighting is serviceable but plain until M8 (lit windows, street lights).
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M1, cloud VM, SwiftShader)
- Sim tick: negligible (no systems yet).
- Overview preset: 108 draw calls, ~675k triangles (trees dominate). Street preset: ~40 calls, ~510k triangles.
- Frame times on SwiftShader are meaningless (several seconds per frame).

## To check on the Mac
- Frame rate while panning the overview and street presets (expect 60 fps; M0 has no city yet).
