import { expect, test, type Page } from '@playwright/test';
import { buildTownViaApi, openGame, serveTownViaApi, shot, watchErrors } from './helpers';

async function state(page: Page) {
  return page.evaluate(() => window.__game!.getState());
}

/** The two-district town from tests/trafficTown.ts, built through the test API. */
async function twoDistrictsViaApi(page: Page): Promise<{ link: number }> {
  return page.evaluate(async () => {
    const g = window.__game!;
    const s = await g.getState();
    const c = { x: 24, z: s.highwayZ };
    const z = c.z;
    const ok = async (cmd: Parameters<typeof g.dispatch>[0]) => {
      const r = await g.dispatch(cmd);
      if (!r.ok) throw new Error(`${cmd.type} failed: ${r.reason}`);
      return r;
    };
    await ok({ type: 'cheat', cheat: 'unlockAll' });
    await ok({ type: 'cheat', cheat: 'addMoney', amount: 400_000 });
    await ok({ type: 'buildRoad', road: 'avenue', points: [c, { x: c.x + 230, z }] });
    await ok({
      type: 'buildRoad',
      road: 'dirt',
      points: [
        { x: c.x + 230, z },
        { x: c.x + 350, z },
      ],
    });
    await ok({
      type: 'buildRoad',
      road: 'avenue',
      points: [
        { x: c.x + 350, z },
        { x: c.x + 570, z },
      ],
    });
    for (const x of [70, 130, 190])
      await ok({
        type: 'buildRoad',
        road: 'street',
        points: [
          { x: c.x + x, z: z - 170 },
          { x: c.x + x, z: z + 170 },
        ],
      });
    for (const x of [410, 470, 530])
      await ok({
        type: 'buildRoad',
        road: 'street',
        points: [
          { x: c.x + x, z: z - 230 },
          { x: c.x + x, z },
        ],
      });
    const brush = (
      zone: 'R' | 'C' | 'I',
      a: { x: number; z: number },
      b: { x: number; z: number },
      radius: number,
    ) => ok({ type: 'zone', zone, area: { kind: 'brush', points: [a, b], radius } });
    await brush('R', { x: c.x + 30, z: z - 95 }, { x: c.x + 220, z: z - 95 }, 75);
    await brush('R', { x: c.x + 30, z: z + 95 }, { x: c.x + 220, z: z + 95 }, 75);
    await brush('C', { x: c.x + 370, z: z - 50 }, { x: c.x + 560, z: z - 50 }, 40);
    await brush('I', { x: c.x + 370, z: z - 165 }, { x: c.x + 560, z: z - 165 }, 70);
    await ok({
      type: 'buildRoad',
      road: 'street',
      points: [
        { x: c.x + 20, z: z - 240 },
        { x: c.x + 300, z: z - 240 },
      ],
    });
    for (const x of [70, 190])
      await ok({
        type: 'buildRoad',
        road: 'street',
        points: [
          { x: c.x + x, z: z - 170 },
          { x: c.x + x, z: z - 240 },
        ],
      });
    for (const def of ['coal', 'coal', 'pump', 'pump', 'pump', 'treatment', 'landfill'])
      if ((await g.placeCivic(def, { x: c.x + 160, z: z - 240 })) === null)
        throw new Error(`no room for ${def}`);
    for (const [def, x, dz] of [
      ['firestation', 130, -100],
      ['police', 130, 100],
      ['clinic', 70, 100],
      ['primary', 190, 100],
      ['firestation', 470, -120],
      ['police', 530, -120],
    ] as const)
      await g.placeCivic(def, { x: c.x + x, z: z + dz });
    return { link: g.segmentAt(c.x + 290, z)!.id };
  });
}

test('M6: a jam forms at a narrow link between homes and jobs, and a bypass clears it', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watchErrors(page);
  await openGame(page);
  const { link } = await twoDistrictsViaApi(page);
  await page.evaluate(() => window.__game!.advance(1440 * 5));
  const jam = await page.evaluate((id) => window.__game!.segVC(id), link);
  const before = (await state(page)).avgCommute;
  expect(jam).toBeGreaterThan(1.5);
  expect(before).toBeGreaterThan(300);
  // The traffic data map, through the maps menu: the link glows red.
  const cz = (await state(page)).highwayZ;
  await page.getByTestId('tool-maps').click();
  await page.getByTestId('map-traffic').click();
  await expect(page.getByTestId('map-legend')).toContainText('Traffic');
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 300, z: cz - 60, distance: 420, yaw: 0, tilt: 0.35 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(2));
  expect((await state(page)).coverageMap).toBeGreaterThan(10);
  await shot(page, 'm6-jam');
  // Build a bypass north of the link (as a player would), and let traffic settle.
  const r = await page.evaluate(
    (cz) =>
      window.__game!.dispatch({
        type: 'buildRoad',
        road: 'street',
        points: [
          { x: 324, z: cz - 240 },
          { x: 434, z: cz - 230 },
        ],
      }),
    cz,
  );
  expect(r.ok).toBe(true);
  await page.evaluate(() => window.__game!.advance(1440 * 2));
  expect(await page.evaluate((id) => window.__game!.segVC(id), link)).toBeLessThan(jam * 0.7);
  expect((await state(page)).avgCommute).toBeLessThan(before * 0.6);
  await page.evaluate(() => window.__game!.waitFrames(3));
  await shot(page, 'm6-bypass');
  errs.check();
});

test('M6: upgrade a road, run buses, click a car and cross the river', async ({ page }) => {
  test.setTimeout(300_000);
  const errs = watchErrors(page);
  await openGame(page);
  await buildTownViaApi(page);
  await serveTownViaApi(page);
  await page.evaluate(() => window.__game!.advance(1440 * 2));
  const cz = (await state(page)).highwayZ;
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 250, z: cz - 40, distance: 360, yaw: 0, tilt: 0.3 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(1));

  // Upgrade a side street to an avenue through the road tool.
  await page.getByTestId('tool-road').click();
  await page.getByTestId('road-avenue').click();
  await page.getByTestId('mode-upgrade').click();
  const target = await page.evaluate((cz) => window.__game!.segmentAt(216, cz - 120), cz);
  expect(target!.type).toBe('street');
  const tp = await page.evaluate((cz) => window.__game!.worldToScreen(216, cz - 120), cz);
  await page.mouse.move(tp.x, tp.y, { steps: 3 });
  await page.waitForTimeout(400);
  await page.mouse.click(tp.x, tp.y);
  await page.waitForTimeout(400);
  expect((await page.evaluate((cz) => window.__game!.segmentAt(216, cz - 120), cz))!.type).toBe('avenue');
  await page.keyboard.press('Escape');

  // A bus depot and stops, placed through the Buses category.
  await page.getByTestId('tool-transit').click();
  await expect(page.getByTestId('place-options')).toBeVisible();
  await page.getByTestId('place-busdepot').click();
  let placed = false;
  for (const [x, dz] of [
    [330, 45],
    [140, 45],
    [440, -45],
    [80, -45],
  ] as const) {
    const p = await page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, cz + dz]);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(300);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
    if (await page.evaluate(() => window.__game!.findCivic('busdepot') !== null)) {
      placed = true;
      break;
    }
  }
  expect(placed).toBe(true);
  await page.getByTestId('place-busstop').click();
  for (const [x, dz] of [
    [120, -80],
    [216, -60],
    [312, -80],
    [408, 70],
    [120, 70],
  ] as const) {
    const p = await page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, cz + dz]);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await page.waitForTimeout(200);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game!.advance(1440));
  const transit = await page.evaluate(() => window.__game!.getTransit());
  expect(transit.stops).toBeGreaterThanOrEqual(4);
  expect(transit.lines.length).toBe(1);
  expect((await state(page)).busRiders).toBeGreaterThan(0);
  await page.evaluate(() => window.__game!.waitFrames(2));
  expect((await state(page)).renderStats.buses).toBeGreaterThan(0);
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 216, z: cz - 30, distance: 170, yaw: 0.5, tilt: 0.1 }),
    cz,
  );
  await shot(page, 'm6-buses');

  // Rush hour: cars on the roads; click one to see its trip.
  await page.evaluate(async () => {
    const g = window.__game!;
    const s = await g.getState();
    const now = (s.tick + 420) % 1440;
    let d = 480 - now;
    if (d <= 0) d += 1440;
    await g.advance(d);
    g.setSpeed(1);
  });
  for (let k = 0; k < 4; k++) await page.evaluate(() => window.__game!.waitFrames(3));
  await page.evaluate(() => window.__game!.setSpeed(0));
  expect((await state(page)).renderStats.cars).toBeGreaterThan(5);
  // Pausing snaps the display clock to the sim, so a car can finish its trip while the camera
  // moves: pick one that is still on the road once the view has settled.
  let same: { id: number; x: number; z: number } | null = null;
  for (let attempt = 0; attempt < 4 && !same; attempt++) {
    const car = await page.evaluate((k) => window.__game!.getCars()[k]!, attempt);
    await page.evaluate(
      (c) => window.__game!.setCamera({ x: c.x, z: c.z, distance: 70, yaw: 0.4, tilt: 0.2 }),
      car,
    );
    await page.evaluate(() => window.__game!.waitFrames(2));
    same = await page.evaluate((id) => window.__game!.getCars().find((c) => c.id === id) ?? null, car.id);
  }
  expect(same).not.toBeNull();
  const cp = await page.evaluate((c) => window.__game!.worldToScreen(c.x, c.z), same!);
  await page.mouse.click(cp.x, cp.y);
  await expect(page.getByTestId('car-trip')).toBeVisible();
  await expect(page.getByTestId('car-trip')).toContainText('From');
  await shot(page, 'm6-car');
  await page.keyboard.press('Escape');

  // A bridge over the river.
  const bridge = await page.evaluate(async () => {
    const g = window.__game!;
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 100_000 });
    const z = 1500;
    let wx = -1;
    for (let x = 900; x < 2000; x += 4)
      if (g.heightAt(x, z) < 0.6) {
        wx = x;
        break;
      }
    let ex = wx;
    while (g.heightAt(ex, z) < 0.6) ex += 4;
    const r = await g.dispatch({
      type: 'buildRoad',
      road: 'avenue',
      points: [
        { x: wx - 140, z },
        { x: ex + 140, z },
      ],
    });
    return { ok: r.ok, x: (wx + ex) / 2, z };
  });
  expect(bridge.ok).toBe(true);
  await page.evaluate(
    (b) => window.__game!.setCamera({ x: b.x, z: b.z, distance: 170, yaw: 0.9, tilt: -0.1 }),
    bridge,
  );
  await shot(page, 'm6-bridge');
  errs.check();
});
