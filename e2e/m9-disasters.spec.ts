import { expect, test, type Page } from '@playwright/test';
import { buildTownViaApi, openGame, serveTownViaApi, shot, watchErrors } from './helpers';

async function state(page: Page) {
  return page.evaluate(() => window.__game!.getState());
}

async function screen(page: Page, x: number, z: number) {
  return page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, z]);
}

/** Pick a disaster from the menu and click the map at (x, z). */
async function setOff(page: Page, kind: string, x: number, z: number) {
  await page.getByTestId('tool-disasters').click();
  await expect(page.getByTestId('disasters-menu')).toBeVisible();
  await page.getByTestId(`disaster-${kind}`).click();
  const p = await screen(page, x, z);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(250);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() => page.evaluate(() => window.__game!.getDisasters().active.length))
    .toBeGreaterThan(0);
}

const rubble = (page: Page) =>
  page.evaluate(() => window.__game!.getBuildings().filter((b) => b.state === 3).length);

test('M9: an earthquake, a tornado and a meteor from the menu do visible damage, and the town recovers', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errs = watchErrors(page);
  await openGame(page);
  await buildTownViaApi(page);
  await serveTownViaApi(page);
  await page.evaluate(async () => {
    const g = window.__game!;
    const s = await g.getState();
    for (const def of ['firestation', 'clinic']) await g.placeCivic(def, { x: 300, z: s.highwayZ + 170 });
    await g.advance(1440 * 2);
  });
  const cz = (await state(page)).highwayZ;
  const pop0 = (await state(page)).population;
  expect(pop0).toBeGreaterThan(300);

  // Earthquake in the middle of town.
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 250, z: cz, distance: 420, yaw: 0.6, tilt: 0.05 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  await setOff(page, 'earthquake', 250, cz - 40);
  await expect(page.getByTestId('toast').filter({ hasText: 'Earthquake!' })).toBeVisible();
  await page.evaluate(() => window.__game!.advance(3));
  await page.evaluate(() => window.__game!.waitFrames(4));
  expect(await rubble(page)).toBeGreaterThan(0);
  expect((await state(page)).renderStats.disasters.dust).toBeGreaterThan(0);
  await shot(page, 'm9-earthquake');
  await page.evaluate(() => window.__game!.advance(60));
  const after = await page.evaluate(() => window.__game!.getDisasters());
  expect(after.damaged.length).toBeGreaterThan(0);
  expect((await state(page)).renderStats.disasters.closures).toBeGreaterThan(0);
  await shot(page, 'm9-earthquake-after');

  // Repairs finish and the town rebuilds.
  await page.evaluate(() => window.__game!.advance(1440 * 3));
  expect((await page.evaluate(() => window.__game!.getDisasters())).damaged.length).toBe(0);
  expect(await rubble(page)).toBe(0);
  expect((await state(page)).population).toBeGreaterThan(pop0 * 0.8);

  // A tornado from the east, heading for town.
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 480, z: cz - 20, distance: 520, yaw: 0.3, tilt: -0.05 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  const before = await rubble(page);
  await setOff(page, 'tornado', 720, cz - 30);
  await page.evaluate(() => window.__game!.advance(14));
  await page.evaluate(() => window.__game!.waitFrames(4));
  expect((await state(page)).renderStats.disasters.funnels).toBe(1);
  await shot(page, 'm9-tornado');
  await page.evaluate(() => window.__game!.advance(80));
  expect((await page.evaluate(() => window.__game!.getDisasters())).active.length).toBe(0);
  expect(await rubble(page)).toBeGreaterThan(before);

  // A meteor: the streak, then the crater.
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 330, z: cz - 90, distance: 950, yaw: 0.9, tilt: -0.25 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  await setOff(page, 'meteor', 330, cz - 90);
  await page.evaluate(() => window.__game!.advance(20));
  await page.evaluate(() => window.__game!.waitFrames(2));
  expect((await state(page)).renderStats.disasters.meteors).toBe(1);
  await shot(page, 'm9-meteor');
  await page.evaluate(() => window.__game!.advance(40));
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 330, z: cz - 90, distance: 220, yaw: 0.9, tilt: 0.1 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(90));
  expect((await page.evaluate(() => window.__game!.getDisasters())).craters.length).toBe(1);
  await shot(page, 'm9-meteor-crater');

  // The notification log tells the story.
  await page.getByTestId('open-notifications').click();
  await expect(page.getByTestId('notifications')).toContainText('The earthquake is over');
  await page.getByTestId('open-notifications').click();

  // Random disasters can be switched off from the menu.
  await page.getByTestId('tool-disasters').click();
  await page.getByTestId('random-disasters').uncheck();
  await expect(page.getByTestId('random-disasters')).not.toBeChecked();
  errs.check();
});

test('M9: a flood by the lake covers the low homes, then drains', async ({ page }) => {
  test.setTimeout(300_000);
  const errs = watchErrors(page);
  await openGame(page, '&seed=b&preset=lakes');
  await page.evaluate(async () => {
    const g = window.__game!;
    await g.dispatch({ type: 'cheat', cheat: 'unlockAll' });
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 400_000 });
    const c = { x: 24, z: 1100 };
    const end = { x: 618, z: 969 };
    await g.dispatch({ type: 'buildRoad', road: 'avenue', points: [c, end] });
    await g.dispatch({
      type: 'zone',
      zone: 'R',
      area: { kind: 'brush', points: [{ x: 440, z: 1008 }, end], radius: 40 },
    });
    for (const def of ['coal', 'pump', 'pump', 'treatment', 'landfill'])
      await g.placeCivic(def, { x: 150, z: 1080 });
    await g.advance(1440 * 2);
  });
  expect((await state(page)).population).toBeGreaterThanOrEqual(30);
  await page.evaluate(() =>
    window.__game!.setCamera({ x: 600, z: 980, distance: 380, yaw: 2.2, tilt: 0.05 }),
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  await setOff(page, 'flood', 640, 962);
  await expect(page.getByTestId('toast').filter({ hasText: 'Flood warning' })).toBeVisible();
  await page.evaluate(() => window.__game!.advance(60 * 6));
  await page.evaluate(() => window.__game!.waitFrames(4));
  expect((await state(page)).renderStats.disasters.floods).toBe(1);
  const wet = await page.evaluate(() => window.__game!.getBuildings().filter((b) => b.flags & 1024).length);
  expect(wet).toBeGreaterThan(0);
  await shot(page, 'm9-flood');
  const end = await page.evaluate(() => {
    const d = window.__game!.getDisasters().active[0]!;
    return d.end;
  });
  await page.evaluate(async (end) => {
    const g = window.__game!;
    const s = await g.getState();
    await g.advance(end - s.tick + 61);
  }, end);
  expect(await page.evaluate(() => window.__game!.getBuildings().filter((b) => b.flags & 1024).length)).toBe(
    0,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  expect((await state(page)).renderStats.disasters.floods).toBe(0);
  errs.check();
});
