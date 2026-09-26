import { expect, test, type Page } from '@playwright/test';
import { buildTownViaApi, openGame, serveTownViaApi, watchErrors } from './helpers';

/**
 * Soak (M12): a served town runs at top speed for a long while (SOAK_MINUTES, default 10) while
 * the player keeps busy: panels, data maps, camera presets, disasters, new roads and zones, quick
 * saves. Nothing may log a console error or leave the city in a broken state.
 * Run with `npm run soak` (it's left out of the normal e2e run).
 */
const MINUTES = Number(process.env.SOAK_MINUTES ?? 10);
const MAPS = ['power', 'water', 'traffic', 'happiness', 'landValue', 'crime', 'airPollution', 'fire'];
const PANELS = ['open-budget', 'open-advisors', 'open-city', 'open-notifications'];

const state = (page: Page) => page.evaluate(() => window.__game!.getState());

test('soak: a busy city at top speed for a long while logs no errors @soak', async ({ page }) => {
  test.setTimeout((MINUTES + 8) * 60_000);
  const errs = watchErrors(page);
  await openGame(page);
  await buildTownViaApi(page);
  await serveTownViaApi(page);
  const cz = (await state(page)).highwayZ;
  await page.evaluate(async (cz) => {
    const g = window.__game!;
    for (const def of ['firestation', 'police', 'clinic', 'primary', 'park_small', 'busdepot'])
      await g.placeCivic(def, { x: 300, z: cz + 170 });
    await g.dispatch({ type: 'setDisasters', on: true });
    g.setSpeed(3);
  }, cz);

  const end = Date.now() + MINUTES * 60_000;
  let step = 0;
  while (Date.now() < end) {
    const k = step++;
    switch (k % 8) {
      case 0:
        await page.getByTestId(PANELS[Math.floor(k / 8) % PANELS.length]!).click();
        await page.evaluate(() => window.__game!.waitFrames(2));
        await page.getByTestId(PANELS[Math.floor(k / 8) % PANELS.length]!).click();
        break;
      case 1:
        await page.getByTestId('tool-maps').click();
        await page.getByTestId(`map-${MAPS[k % MAPS.length]}`).click();
        await page.evaluate(() => window.__game!.waitFrames(2));
        await page.getByTestId('map-legend').getByRole('button').click();
        break;
      case 2:
        await page.evaluate(
          ([preset]) => window.__game!.setCamera(preset as never),
          [['overview', 'city', 'street'][k % 3]!],
        );
        break;
      case 3: {
        // A disaster somewhere in town, cycling through the kinds.
        const kinds = ['quake', 'tornado', 'meteor', 'flood'] as const;
        await page.evaluate(
          ([kind, x, z]) =>
            window.__game!.dispatch({ type: 'disaster', kind: kind as never, at: { x: x!, z: z! } }),
          [kinds[Math.floor(k / 8) % 4]!, 150 + ((k * 37) % 300), cz - 100 + ((k * 53) % 200)] as const,
        );
        break;
      }
      case 4:
        // The town keeps growing: another street and more homes to the north.
        await page.evaluate(
          async ([x, cz]) => {
            const g = window.__game!;
            await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 20_000 });
            await g.dispatch({
              type: 'buildRoad',
              road: 'street',
              points: [
                { x: x!, z: cz! - 160 },
                { x: x!, z: cz! - 320 },
              ],
            });
            await g.dispatch({
              type: 'zone',
              zone: 'R',
              area: {
                kind: 'brush',
                points: [
                  { x: x! - 30, z: cz! - 200 },
                  { x: x! + 30, z: cz! - 300 },
                ],
                radius: 40,
              },
            });
          },
          [72 + ((k * 48) % 432), cz] as const,
        );
        break;
      case 5:
        await page.getByTestId('menu-button').click();
        await page.getByTestId('menu-save').click();
        await expect(page.getByTestId('toast').first()).toBeVisible();
        await page.getByTestId('pause-resume').click();
        break;
      case 6: {
        const s = await state(page);
        for (const v of [s.treasury, s.population, s.approval, s.demand.R, s.demand.C, s.demand.I])
          expect(Number.isFinite(v)).toBe(true);
        break;
      }
      default:
        await page.evaluate(() => window.__game!.waitFrames(10));
    }
    errs.check();
  }
  // Still alive, still ticking, still drawing.
  const t0 = (await state(page)).tick;
  await page.evaluate(() => window.__game!.waitFrames(5));
  await expect.poll(async () => (await state(page)).tick, { timeout: 30_000 }).toBeGreaterThan(t0);
  expect((await state(page)).population).toBeGreaterThan(0);
  errs.check();
});
