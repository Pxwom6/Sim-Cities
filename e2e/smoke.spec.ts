import { expect, test } from '@playwright/test';
import { openGame, shot, watchErrors } from './helpers';

test('M0 smoke: map renders from every camera preset, controls work, no console errors', async ({ page }) => {
  const errs = watchErrors(page);
  await openGame(page);

  await expect(page.getByTestId('topbar')).toBeVisible();
  await expect(page.getByTestId('treasury')).toHaveText(/\$60,000/);

  for (const preset of ['overview', 'city', 'street', 'aerial'] as const) {
    await page.evaluate((p) => window.__game!.setCamera(p), preset);
    await shot(page, `m0-${preset}`);
    const st = await page.evaluate(() => window.__game!.getState());
    expect(st.renderStats.calls).toBeGreaterThan(5);
    expect(st.renderStats.triangles).toBeGreaterThan(10_000);
  }

  // Night view from the city preset.
  await page.evaluate(async () => {
    const g = window.__game!;
    const s = await g.getState();
    const hourNow = ((s.tick + 420) % 1440) / 60;
    let d = (21 - hourNow) * 60;
    if (d <= 0) d += 1440;
    await g.advance(Math.round(d));
    g.setCamera('city');
  });
  await shot(page, 'm0-city-night');

  // Camera controls: keyboard pan, wheel zoom, right-drag rotate, left-drag pan.
  await page.evaluate(() => window.__game!.setCamera('city'));
  const canvas = page.locator('#scene');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cam0 = await page.evaluate(() => window.__game!.getCamera());

  await page.mouse.move(cx, cy);
  await page.keyboard.down('KeyD');
  // Software rendering is slow: hold the key across rendered frames rather than wall-clock time.
  await page.evaluate(() => window.__game!.waitFrames(3));
  await page.keyboard.up('KeyD');
  const cam1 = await page.evaluate(() => window.__game!.getCamera());
  expect(Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z)).toBeGreaterThan(5);

  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(100);
  const cam2 = await page.evaluate(() => window.__game!.getCamera());
  expect(cam2.distance).toBeGreaterThan(cam1.distance * 1.3);

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 150, cy, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  const cam3 = await page.evaluate(() => window.__game!.getCamera());
  expect(Math.abs(cam3.yaw - cam2.yaw)).toBeGreaterThan(0.3);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 200, cy - 60, { steps: 4 });
  await page.mouse.up();
  const cam4 = await page.evaluate(() => window.__game!.getCamera());
  expect(Math.hypot(cam4.x - cam3.x, cam4.z - cam3.z)).toBeGreaterThan(20);

  // Debug panel toggles with backtick.
  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('debug-panel')).toBeVisible();
  await page.keyboard.press('Backquote');
  await expect(page.getByTestId('debug-panel')).toBeHidden();

  // Time runs when unpaused.
  const t0 = (await page.evaluate(() => window.__game!.getState())).tick;
  await page.getByTestId('speed-3').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('speed-0').click();
  const t1 = (await page.evaluate(() => window.__game!.getState())).tick;
  expect(t1).toBeGreaterThan(t0 + 5);

  // Commands go through the same path as the UI.
  const res = await page.evaluate(() =>
    window.__game!.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 5000 }),
  );
  expect(res.ok).toBe(true);
  await expect(page.getByTestId('treasury')).toHaveText(/\$65,000/);

  errs.check();
});
