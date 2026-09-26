import { expect, test, type Page } from '@playwright/test';
import { buildTownViaApi, openGame, shot, watchErrors } from './helpers';

async function state(page: Page) {
  return page.evaluate(() => window.__game!.getState());
}

test('M4: utilities placed through the UI supply the town; cutting power visibly hurts it', async ({
  page,
}) => {
  const errs = watchErrors(page);
  await openGame(page);
  await buildTownViaApi(page);
  await page.evaluate(() => window.__game!.advance(700));
  // Unserved town: problem icons appear over buildings.
  await page.evaluate(() => window.__game!.waitFrames(2));
  expect((await state(page)).renderStats.icons).toBeGreaterThan(10);

  const cz = (await state(page)).highwayZ;
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 170, z: cz + 20, distance: 300, yaw: 0, tilt: 0.55 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(1));

  // Place a coal plant beside the avenue by clicking through the real toolbar.
  await page.getByTestId('tool-power').click();
  await expect(page.getByTestId('place-options')).toBeVisible();
  await page.getByTestId('place-coal').click();
  const civicsBefore = (await state(page)).civics;
  let placed = false;
  for (const [x, dz] of [
    [70, 40],
    [70, -40],
    [300, 45],
    [300, -45],
    [420, 45],
  ] as const) {
    const p = await page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, cz + dz]);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(200);
    if ((await state(page)).civics > civicsBefore) {
      placed = true;
      break;
    }
  }
  expect(placed).toBe(true);
  // Water, sewage and garbage via the test API to keep this test short.
  await page.evaluate(async () => {
    const g = window.__game!;
    await g.dispatch({ type: 'cheat', cheat: 'unlockAll' });
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 60_000 });
    for (const def of ['pump', 'pump', 'treatment', 'landfill']) await g.placeCivic(def);
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game!.advance(120));
  const s1 = await state(page);
  expect(s1.utilities.power.supply).toBeGreaterThan(s1.utilities.power.demand);
  expect(s1.utilities.power.unserved).toBe(0);

  // The power data map, through the maps menu.
  await page.getByTestId('tool-maps').click();
  await page.getByTestId('map-power').click();
  await expect(page.getByTestId('map-legend')).toBeVisible();
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 250, z: cz + 40, distance: 420, yaw: 0.4, tilt: 0 }),
    cz,
  );
  await shot(page, 'm4-power-map');

  // Bulldoze the plant: power is cut, icons return and businesses close.
  await page.evaluate(async () => {
    const g = window.__game!;
    const s = await g.getState();
    void s;
  });
  const coalId = await page.evaluate(() => window.__game!.findCivic('coal'));
  expect(coalId).not.toBeNull();
  await page.evaluate(
    (id) => window.__game!.dispatch({ type: 'bulldoze', target: { kind: 'civic', id: id! } }),
    coalId,
  );
  await page.evaluate(() => window.__game!.advance(60 * 14));
  const s2 = await state(page);
  expect(s2.utilities.power.served).toBe(0);
  await page.evaluate(() => window.__game!.waitFrames(2));
  expect((await state(page)).renderStats.icons).toBeGreaterThan(10);
  await shot(page, 'm4-power-cut');
  await page.getByTestId('map-legend').getByRole('button').click();

  // The landfill's inspector shows how collection is going and sells extra trucks.
  const lf = await page.evaluate(() => window.__game!.getCivics().find((c) => c.def === 'landfill')!);
  // Power back on first (the trucks don't run from a dark landfill), then a day of collection.
  await page.evaluate(async () => {
    const g = window.__game!;
    await g.placeCivic('coal');
    await g.advance(1440);
  });
  await page.evaluate(
    (c) => window.__game!.setCamera({ x: c.x, z: c.z, distance: 150, yaw: 0.4, tilt: 0.3 }),
    lf,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  const at = await page.evaluate((c) => window.__game!.worldToScreen(c.x, c.z), lf);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('inspector')).toContainText('Landfill');
  await expect(page.getByTestId('garbage-trucks')).toHaveText(/^\d+ of 4$/);
  await expect(page.getByTestId('garbage-collected')).toContainText('a day');
  await expect(page.getByTestId('garbage-produced')).toContainText('a day');
  await expect(page.getByTestId('garbage-rounds')).toHaveText(/ h, \d+(\.\d)? stops?, \d+ of 400 a load$/);
  const money = (await state(page)).treasury;
  await page.getByTestId('buy-truck').click();
  await expect(page.getByTestId('garbage-trucks')).toHaveText(/^\d+ of 5$/);
  expect((await state(page)).treasury).toBe(money - 1_200);
  await shot(page, 'playtest-landfill');
  await page.keyboard.press('Escape');
  errs.check();
});
