import { expect, test, type Page } from '@playwright/test';
import { buildTownViaApi, openGame, serveTownViaApi, shot, watchErrors } from './helpers';

async function state(page: Page) {
  return page.evaluate(() => window.__game!.getState());
}

async function screen(page: Page, x: number, z: number) {
  return page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, z]);
}

/** Pick a building from a toolbar category and click candidate spots until it's placed. */
async function placeViaUi(page: Page, category: string, def: string, spots: [number, number][]) {
  await page.getByTestId(`tool-${category}`).click();
  await page.getByTestId(`place-${def}`).click();
  for (const [x, z] of spots) {
    const p = await screen(page, x, z);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(300);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    if (await page.evaluate((d) => window.__game!.findCivic(d) !== null, def)) break;
  }
  await page.getByTestId('tool-select').click();
  expect(await page.evaluate((d) => window.__game!.findCivic(d), def)).not.toBeNull();
}

test('M10: milestones celebrate and unlock, policies and modules work, specialisations earn', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errs = watchErrors(page);
  await openGame(page);
  await buildTownViaApi(page);
  await serveTownViaApi(page);
  await page.evaluate(async () => {
    const g = window.__game!;
    const s = await g.getState();
    for (const def of ['firestation', 'police', 'clinic', 'primary', 'park_small'])
      await g.placeCivic(def, { x: 300, z: s.highwayZ + 170 });
  });
  const cz = (await state(page)).highwayZ;

  // Grow past 800 residents: the Village milestone is celebrated with its unlocks.
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__game!.advance(360));
        return (await state(page)).peak;
      },
      { timeout: 120_000, intervals: [0] },
    )
    .toBeGreaterThanOrEqual(800);
  await expect(page.getByTestId('milestone-banner')).toBeVisible();
  await expect(page.getByTestId('milestone-banner')).toContainText('Village');
  await expect(page.getByTestId('milestone-banner')).toContainText('Bus depot');
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 260, z: cz, distance: 520, yaw: 0.4, tilt: 0.1 }),
    cz,
  );
  await shot(page, 'm10-milestone');
  // It dismisses itself after a few seconds, or on a click.
  const banner = page.getByTestId('milestone-banner');
  await banner.click({ timeout: 3000 }).catch(() => undefined);
  await expect(banner).toBeHidden();

  // The city panel: next milestone and what it brings; a policy; achievements.
  await page.getByTestId('open-city').click();
  await expect(page.getByTestId('city-panel')).toContainText('Town');
  await expect(page.getByTestId('next-unlocks')).toContainText('High school');
  await page.getByTestId('city-tab-policies').click();
  await page.getByTestId('policy-fireSafety').check();
  await expect.poll(async () => (await state(page)).policies).toContain('fireSafety');
  await shot(page, 'm10-policies');
  await page.getByTestId('city-tab-achievements').click();
  await expect(page.getByTestId('achievements').locator('.achievement.got').first()).toBeVisible();
  await page.getByTestId('open-city').click();

  // A landmark and a hotel through the toolbar: visitors arrive. (A grant pays for them.)
  await page.evaluate(() => window.__game!.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 150_000 }));
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 260, z: cz + 60, distance: 520, yaw: 0, tilt: 0.45 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  // Beside the side streets (x = 120, 216, 312, 408) near their ends.
  const spots: [number, number][] = [];
  for (const dz of [-140, 140]) for (const x of [140, 236, 332, 428]) spots.push([x, cz + dz]);
  await placeViaUi(page, 'landmark', 'clocktower', spots);
  await placeViaUi(page, 'landmark', 'hotel', spots);
  await page.evaluate(() => window.__game!.advance(120));
  expect((await state(page)).visitors).toBeGreaterThan(100);
  const tower = await page.evaluate(() => window.__game!.getCivics().find((c) => c.def === 'clocktower')!);
  await page.evaluate(
    (t) => window.__game!.setCamera({ x: t.x, z: t.z, distance: 150, yaw: 0.6, tilt: 0.15 }),
    tower,
  );
  await shot(page, 'm10-landmarks');

  // A module on the fire station, from its inspector.
  const fs = await page.evaluate(() => window.__game!.getCivics().find((c) => c.def === 'firestation')!);
  await page.evaluate(
    (f) => window.__game!.setCamera({ x: f.x, z: f.z, distance: 110, yaw: 0.3, tilt: 0.6 }),
    fs,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  // Click a point that picks the fire station (its neighbours are close by).
  const centre = await screen(page, fs.x, fs.z);
  let aimed = false;
  for (const [dx, dy] of [
    [0, 0],
    [0, 20],
    [20, 0],
    [-20, 0],
    [0, -20],
  ] as const) {
    const hit = await page.evaluate(
      ([x, y]) => window.__game!.pickAt(x!, y!),
      [centre.x + dx, centre.y + dy],
    );
    if (hit?.kind === 'civic' && hit.id === fs.id) {
      await page.mouse.click(centre.x + dx, centre.y + dy);
      aimed = true;
      break;
    }
  }
  expect(aimed).toBe(true);
  await expect(page.getByTestId('modules')).toBeVisible();
  await page.getByTestId('add-module-engineBay').click();
  await expect(page.getByTestId('modules')).toContainText('Added');
  await shot(page, 'm10-module');
  await page.keyboard.press('Escape');

  // An oil well: the resources map opens to show the oil fields; it pumps and sells.
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 90, z: cz + 20, distance: 260, yaw: 0, tilt: 0.45 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  await page.getByTestId('tool-special').click();
  await page.getByTestId('place-oilwell').click();
  await expect(page.getByTestId('map-legend')).toContainText('Ore and oil');
  for (const [x, dz] of [
    [60, 20],
    [75, 20],
    [90, 20],
    [60, -20],
    [75, -20],
    [100, -20],
  ] as const) {
    const p = await screen(page, x, cz + dz);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(300);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    if (await page.evaluate(() => window.__game!.findCivic('oilwell') !== null)) break;
  }
  expect(await page.evaluate(() => window.__game!.findCivic('oilwell'))).not.toBeNull();
  await shot(page, 'm10-oilwell');
  await page.getByTestId('tool-select').click();
  await page.getByTestId('map-legend').getByRole('button').click();
  await page.evaluate(() => window.__game!.advance(1440));
  await page.getByTestId('open-budget').click();
  await expect(page.getByTestId('budget')).toContainText('Ore and oil sales');
  await expect(page.getByTestId('budget')).toContainText('Tourism');
  await page.getByTestId('open-budget').click();
  errs.check();
});
