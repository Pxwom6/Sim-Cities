import { expect, test, type Page } from '@playwright/test';
import { buildTownViaApi, openGame, serveTownViaApi, shot, watchErrors } from './helpers';

async function state(page: Page) {
  return page.evaluate(() => window.__game!.getState());
}

test('M5: a fire station placed through the UI covers the roads it can reach and answers a fire', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errs = watchErrors(page);
  await openGame(page);
  await buildTownViaApi(page);
  await serveTownViaApi(page);
  const cz = (await state(page)).highwayZ;
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 200, z: cz, distance: 380, yaw: 0, tilt: 0.3 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(1));

  // Pick the fire station from the toolbar; hovering beside a road previews its coverage.
  await page.getByTestId('tool-fire').click();
  await expect(page.getByTestId('place-options')).toBeVisible();
  await page.getByTestId('place-firestation').click();
  const before = (await state(page)).civics;
  let placed = false;
  for (const [x, dz] of [
    [150, -45],
    [150, 45],
    [260, -45],
    [260, 45],
  ] as const) {
    const p = await page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, cz + dz]);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__game!.waitFrames(2));
    if ((await state(page)).coveragePreview === 0) continue;
    await shot(page, 'm5-coverage-preview');
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    if ((await state(page)).civics > before) {
      placed = true;
      break;
    }
  }
  expect(placed).toBe(true);
  await page.keyboard.press('Escape');
  expect((await state(page)).coveragePreview).toBe(0);

  // Let the town grow for two months.
  await page.evaluate(() => window.__game!.advance(1440 * 2));
  expect((await state(page)).population).toBeGreaterThan(150);

  // The fire coverage data map tints the roads the station can reach.
  await page.getByTestId('tool-maps').click();
  await page.getByTestId('map-fire').click();
  await expect(page.getByTestId('map-legend')).toBeVisible();
  await page.evaluate(() => window.__game!.waitFrames(2));
  expect((await state(page)).coverageMap).toBeGreaterThan(5);
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 260, z: cz + 10, distance: 430, yaw: 0, tilt: 0.35 }),
    cz,
  );
  await shot(page, 'm5-fire-map');
  await page.getByTestId('map-legend').getByRole('button').click();
  expect((await state(page)).coverageMap).toBe(0);

  // Start a fire near the station: an engine drives there and puts it out.
  const station = await page.evaluate(() => window.__game!.getCivics().find((c) => c.def === 'firestation')!);
  const target = await page.evaluate((st) => {
    const list = window.__game!.getBuildings().filter((b) => b.state === 1);
    const d = (b: { x: number; z: number }) => Math.hypot(b.x - st.x, b.z - st.z);
    return list.filter((b) => d(b) > 80).sort((a, b) => d(a) - d(b))[0]!;
  }, station);
  const r = await page.evaluate(
    (id) => window.__game!.dispatch({ type: 'cheat', cheat: 'ignite', id }),
    target.id,
  );
  expect(r.ok).toBe(true);
  await page.evaluate(() => window.__game!.advance(25));
  await page.evaluate(() => window.__game!.waitFrames(2));
  const engines = await page.evaluate(() => window.__game!.getVehicles().filter((v) => v.kind === 'fire'));
  expect(engines.length).toBeGreaterThan(0);
  expect((await state(page)).renderStats.fires).toBeGreaterThan(0);
  await page.evaluate(
    (t) => window.__game!.setCamera({ x: t.x, z: t.z, distance: 150, yaw: 0.5, tilt: 0.1 }),
    target,
  );
  await shot(page, 'm5-fire-response');
  let out = false;
  for (let k = 0; k < 30 && !out; k++) {
    await page.evaluate(() => window.__game!.advance(20));
    const b = await page.evaluate((id) => window.__game!.getBuildings().find((x) => x.id === id), target.id);
    out = !!b && b.fire === 0 && b.state === 1;
  }
  expect(out).toBe(true);

  // Every building explains its mood: click a home and read the inspector.
  const home = await page.evaluate(() => {
    const list = window.__game!.getBuildings().filter((b) => b.state === 1 && b.zone === 1);
    return list[Math.floor(list.length / 2)]!;
  });
  await page.evaluate(
    (h) => window.__game!.setCamera({ x: h.x, z: h.z, distance: 120, yaw: 0.3, tilt: 0.3 }),
    home,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  const hp = await page.evaluate((h) => window.__game!.worldToScreen(h.x, h.z), home);
  await page.mouse.click(hp.x, hp.y);
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-factors')).toBeVisible();
  expect(await page.getByTestId('inspector-factors').locator('li').count()).toBeGreaterThan(3);
  await expect(page.getByTestId('inspector-coverage')).toBeVisible();
  await expect(page.getByTestId('inspector-coverage')).toContainText('Fire');
  await shot(page, 'm5-inspector');
  errs.check();
});
