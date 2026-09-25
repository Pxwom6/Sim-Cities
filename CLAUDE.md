# CLAUDE.md

This project is an original 3D city-building game for the browser, built by you across many autonomous sessions. **SPEC.md is the brief and the source of truth.** `DESIGN.md` (which you'll write in M0) holds the technical design, and `PROGRESS.md` holds the current state.

## Start of every session, and after any context compaction
1. Read `PROGRESS.md` to see where things stand and what's next.
2. Re-read the SPEC.md entries for the current milestone.
3. If tests exist, run them so you know the starting state before changing anything.

## Working rules
- **Work autonomously.** Assume I'm not around. Don't stop to ask questions or wait for approval: when something's ambiguous, make the call a thoughtful game designer would, note it in `docs/DECISIONS.md` with a one-line reason, and keep going.
- **Small, verified steps.** Work through the milestones in order, breaking each into small steps, and get each step working and tested before starting the next.
- **Commit and push often.** Commit after every working step with a clear message, and push straight away. Never commit a broken build. When a milestone meets its done criteria, start that commit's message with `M<n> complete:` (git tags can't be pushed from cloud sessions).
- **Keep PROGRESS.md current.** Open it with a checklist of all 13 milestones (`- [ ] M0 Foundation` through `- [ ] M12 Balance, performance and polish`) and tick one (`- [x]`) only when it meets its done criteria. Below that: what's in progress, the next few tasks, known issues and the latest performance numbers. Update it whenever you finish a step and before any long-running job, so a fresh session could carry on from it alone. Keep it short; history lives in git.
- **Verify for real** (SPEC.md section 8). A feature is done when its tests pass and you've seen it working in screenshots you actually looked at.
- **Be honest.** Never hardcode results to make a test pass, weaken or delete a test to get to green, or describe a stub as finished. If something doesn't work yet, say so in PROGRESS.md, along with what you tried.
- **Don't get stuck.** If a problem resists repeated attempts, write down what you tried, choose a simpler approach that still meets the spec, move on, and revisit it in M12.
- **Protect your context.** Use subagents for self-contained side jobs (researching a technique, reviewing a batch of screenshots, writing a set of tests), and don't dump huge files or logs into the conversation.
- **Leave `.claude/` alone.** Edits in there can trigger permission prompts that would stall an unattended run.
- **Quality over speed.** A solid, polished milestone is worth more than racing ahead on shaky foundations.
- **Keep going** until every milestone in SPEC.md is complete. Only stop early if you hit something only I can fix (a missing system dependency, say), and if so, put exactly what you need at the top of PROGRESS.md.

## Cloud sessions
When `CLAUDE_CODE_REMOTE` is `true`, you're running in a cloud VM cloned fresh from GitHub:
- Only what's committed and pushed survives. The VM can be reclaimed, so push after every commit.
- You can push only to this session's working branch. Don't try to push other branches or tags.
- If Playwright reports a missing browser, run `npx playwright install chromium`; the environment allows Playwright's download hosts.
- There's no GPU, so WebGL runs on Chromium's software renderer. Launch Chromium with `--enable-unsafe-swiftshader` (plus `--use-angle=swiftshader` if needed) or WebGL context creation may fail. Software rendering is slow, so keep e2e runs lean.
- Frame times here say nothing about real performance. Track sim tick time, draw calls and triangle counts instead, and list anything that needs a real-hardware check under **To check on the Mac** in PROGRESS.md.
- The VM has about 4 CPUs and 16 GB of RAM, so run heavy benchmarks one at a time.

## Project notes
_Maintained by Claude. Keep this brief: how to run, test and build; the folder layout; key conventions; gotchas learned the hard way._

- **Run:** `npm run dev` (Vite, :5173). Query params: `?seed=…&preset=river|coast|lakes|highlands&paused=1`.
- **Check everything:** `npm run typecheck && npm run lint && npm test && npm run e2e` (e2e builds `--mode test` into `dist-test/` and serves it on :4174).
- **Screenshots while iterating:** `npm run build:test && node scripts/shots.mjs <outDir> overview,city,street@21` (`name@hour` fast-forwards to that hour first). SwiftShader takes 5–25 s per frame, so keep e2e lean and wait on `__game.waitFrames(n)`, not wall-clock time.
- **Dev scenes:** `node scripts/dev/townshot.mjs <out>` (grown town), `node scripts/dev/svcshot.mjs <out>` (services, coverage maps, a fire; `EACH=1` adds per-building close-ups), `node scripts/dev/montage.mjs out.png <cols> a.png b.png …` tiles screenshots for one-look review. Headless probes: `npx tsx scripts/dev/svc.ts svc|util|none` (growth/coverage/mood table), `scripts/dev/traffic.ts` (busiest roads), `scripts/dev/jam.ts` / `bus.ts` (bottleneck before/after a bypass or buses). Scenes: `trafficshot.mjs` (cars, buses, traffic map), `bridgeshot.mjs`, `envshot.mjs` (smoke, air and education maps). Environment probes: `env.ts` (sickness/education/tiers by month), `wind.ts` (upwind vs downwind homes), `airmap.ts` (air field around a plant), `fires.ts` (outbreak sizes without a fire station). M8: `gallery.mjs <out> R|C|I [hour]` (every building archetype side by side), `audioprobe.mjs` (renders every sound offline and prints levels), `npx tsx scripts/dev/modelstats.ts` (triangles per model type); `townshot.mjs` takes `WALK=1` (walker counts) and `TILT=1` (tilt-shift).
- **Scripts in TS:** run with `npx tsx scripts/….ts` (vite-node does not work with Vite 8).
- **Layout:** `src/sim` (pure, deterministic, runs in the worker; ESLint forbids DOM/Three/Math.random/Date there), `src/data` (balancing config), `src/client` (SimClient, ClientWorld mirror, test API), `src/render` (Three.js), `src/ui` (Preact + `styles/tokens.css`), `tests/` (Vitest), `e2e/` (Playwright).
- **Audio:** `src/audio` is main-thread only; effects are recipes in `sounds.ts` taking any BaseAudioContext, so tests render them offline via `__game.renderSounds()`.
- **Gotchas:** in e2e, Escape doesn't leave the road tool (it only cancels a drag): click `tool-select`. `prettier --check … | tail` hides the exit code; run `npm run lint` before committing. `pkill -f <pattern>` can match and kill its own shell, so avoid it. Playwright is pinned to 1.56.1 to match the VM's Chromium 1194. TypeScript is pinned to 6.0 for typescript-eslint.

