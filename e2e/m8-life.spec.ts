import { expect, test, type Page } from '@playwright/test';
import { buildTownViaApi, openGame, serveTownViaApi, shot, watchErrors } from './helpers';

async function state(page: Page) {
  return page.evaluate(() => window.__game!.getState());
}

async function screen(page: Page, x: number, z: number) {
  return page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, z]);
}

/** Advance to the next occurrence of `hour` (game time). */
async function advanceTo(page: Page, hour: number) {
  await page.evaluate(async (hour) => {
    const g = window.__game!;
    const s = await g.getState();
    const now = ((s.tick + 420) % 1440) / 60;
    let d = (hour - now) * 60;
    if (d <= 0) d += 1440;
    await g.advance(Math.round(d));
  }, hour);
}

test('M8: advisors name the problem and show where, notifications and thoughts lead to it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errs = watchErrors(page);
  await openGame(page);
  // A town with no utilities at all: every advisor should have something to say.
  await buildTownViaApi(page);
  await page.evaluate(() => window.__game!.advance(1440 * 2));
  await page.getByTestId('open-advisors').click();
  const panel = page.getByTestId('advisors');
  await expect(panel).toBeVisible();
  const utilities = panel.getByTestId('advisor-utilities');
  await expect(utilities).toContainText(/without power/i);
  await shot(page, 'm8-advisors');
  // "Show me" flies to the problem and opens the matching data map.
  const before = await page.evaluate(() => window.__game!.getCamera());
  await utilities
    .locator('.advice', { hasText: /without power/i })
    .getByTestId('advice-show')
    .click();
  await expect(page.getByTestId('map-legend')).toContainText('Power');
  await page.evaluate(() => window.__game!.waitFrames(40));
  const after = await page.evaluate(() => window.__game!.getCamera());
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(50);
  await shot(page, 'm8-advice-power-map');
  await page.getByTestId('map-legend').getByRole('button').click();
  await page.getByTestId('open-advisors').click();

  // The notification log keeps what happened; entries fly to the place.
  await page.getByTestId('open-notifications').click();
  const notices = page.getByTestId('notice');
  await expect(notices.first()).toBeVisible();
  expect(await notices.count()).toBeGreaterThan(0);
  await shot(page, 'm8-notifications');
  await page.getByTestId('open-notifications').click();

  // Resident thoughts come from real buildings; clicking one opens that building.
  const thought = page.getByTestId('thoughts').locator('.thought').first();
  await expect(thought).toBeVisible();
  await thought.click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-address')).toContainText(/,/);

  // Street names label the roads at close zoom.
  const cz = (await state(page)).highwayZ;
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 200, z: cz, distance: 150, yaw: 0.4, tilt: 0.1 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(4));
  expect(await page.locator('.street-label').count()).toBeGreaterThan(0);
  errs.check();
});

test('M8: night city, pedestrians, audio and tilt-shift', async ({ page }) => {
  test.setTimeout(300_000);
  const errs = watchErrors(page);
  await openGame(page);
  const cz = (await state(page)).highwayZ;
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 260, z: cz, distance: 520, yaw: 0, tilt: 0.55 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(1));

  // Audio starts on the first gesture; building through the UI plays its sounds.
  await page.getByTestId('tool-road').click();
  await page.getByTestId('road-street').click();
  const a = await screen(page, 560, cz);
  const b = await screen(page, 700, cz);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId('tool-select').click();
  await expect
    .poll(() => page.evaluate(() => window.__game!.getAudio().played.build ?? 0))
    .toBeGreaterThan(0);
  const audio = await page.evaluate(() => window.__game!.getAudio());
  expect(audio.running).toBe(true);
  expect(audio.played.click ?? 0).toBeGreaterThan(0);
  // Every effect and the ambient bed render to real, unclipped, finite sound.
  const sounds = await page.evaluate(() => window.__game!.renderSounds());
  expect(sounds.length).toBeGreaterThan(8);
  for (const s of sounds) {
    expect(s.finite, s.name).toBe(true);
    expect(s.rms, s.name).toBeGreaterThan(1e-3);
    expect(s.peak, s.name).toBeLessThan(1);
  }

  await buildTownViaApi(page);
  await serveTownViaApi(page);
  await page.evaluate(() => window.__game!.advance(1440 * 3));
  expect((await state(page)).population).toBeGreaterThan(300);

  // Close to the streets: walkers on the pavements, and the ambient bed hears the town.
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 150, z: cz - 40, distance: 120, yaw: 0.8, tilt: 0 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(30));
  const walkers = await page.evaluate(() => window.__game!.getWalkers());
  expect(walkers.length).toBeGreaterThan(5);
  for (const w of walkers) expect(w.route).toBeLessThanOrEqual(1200);
  await expect
    .poll(() => page.evaluate(() => window.__game!.getAudio().ambient?.mix.wind ?? 0))
    .toBeGreaterThan(0);
  // Click a walker (centred in view, clear of the panels): the inspector tells their trip.
  let picked = false;
  for (const w of walkers.slice(0, 6)) {
    await page.evaluate(
      (w) => window.__game!.setCamera({ x: w.x, z: w.z, distance: 70, yaw: 0.8, tilt: 0 }),
      w,
    );
    await page.evaluate(() => window.__game!.waitFrames(2));
    const now = (await page.evaluate(() => window.__game!.getWalkers())).find((x) => x.id === w.id);
    if (!now) continue;
    const p = await screen(page, now.x, now.z);
    await page.mouse.click(p.x, p.y);
    const text = await page
      .getByTestId('inspector')
      .textContent({ timeout: 1500 })
      .catch(() => '');
    if (text && /Pedestrian/.test(text) && /Walking/.test(text)) {
      picked = true;
      break;
    }
    await page.keyboard.press('Escape');
  }
  expect(picked).toBe(true);
  await shot(page, 'm8-pedestrian');
  await page.keyboard.press('Escape');

  // Night: lamps along the streets, lit windows and headlights.
  await advanceTo(page, 22);
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 260, z: cz, distance: 520, yaw: 0.5, tilt: 0 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(4));
  const night = await state(page);
  expect(night.renderStats.night).toBeGreaterThan(0.8);
  expect(night.renderStats.lamps).toBeGreaterThan(20);
  await shot(page, 'm8-night-overview');
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 150, z: cz - 60, distance: 110, yaw: 0.8, tilt: 0 }),
    cz,
  );
  await shot(page, 'm8-night-street');

  // Tilt-shift and volumes through the menu, and they persist across a reload.
  await advanceTo(page, 15);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('tilt-shift').check();
  await page.getByTestId('vol-masterVolume').fill('30');
  await page.getByTestId('menu-button').click();
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 150, z: cz - 60, distance: 110, yaw: 0.8, tilt: 0 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(4));
  expect(await page.evaluate(() => window.__game!.setSettings({}))).toBeGreaterThan(0);
  await shot(page, 'm8-tilt-shift');
  await openGame(page);
  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('tilt-shift')).toBeChecked();
  await expect(page.getByTestId('vol-masterVolume')).toHaveValue('30');
  errs.check();
});
