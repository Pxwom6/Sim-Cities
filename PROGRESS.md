# PROGRESS

- [x] M0 Foundation
- [x] M1 Roads and zoning
- [x] M2 Growth
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
M3 Money (not started).

## Next tasks
1. Ledger with categories (taxes by zone/wealth, upkeep, roads, loans, policies, trade, one-offs); exact "income − expenses = Δtreasury" invariant; monthly close + 24-month history.
2. Tax commands (9 rates) feeding demand, spawn chance per wealth and happiness; department funding sliders.
3. Loans (take/repay, annuity), low-money warnings, bankruptcy after a 2-month grace period (sandbox exempt). Save migration v1 → v2.
4. Budget panel with charts (income/expense lines, projection, history), top-bar net income.
5. Scenario tests: taxes shift demand; a city can go bankrupt.

## Known issues
- Mood tops out around 0.65 until services exist (M5); upgrade threshold set to 0.62 for now.
- Commercial demand runs slightly negative in small towns (0.12 shop jobs per resident); revisit in balance.
- Night lighting is serviceable but plain until M8 (lit windows, street lights).
- Tree count is high in forests (~25k in-map); LOD switches to low-poly beyond 750 m.

## Performance (M2)
- `npx tsx scripts/bench.ts 12 9`: grid city of 193 segments grows to 10.2k residents / 414 buildings in 7 months. Sim tick avg 0.06 ms, p99 1.5 ms, worst 17.5 ms (hourly systems). Full year simulated in 1.05 s.
- Grown test town (137 buildings): 82 draw calls, ~850k triangles on SwiftShader at the town view (trees dominate).

## To check on the Mac
- Frame rate while panning the overview and street presets (expect 60 fps; M0 has no city yet).
