import { expect, test, type Page } from '@playwright/test';
import { openGame, shot, watchErrors } from './helpers';

async function state(page: Page) {
  return page.evaluate(() => window.__game!.getState());
}

async function screen(page: Page, x: number, z: number) {
  return page.evaluate(([x, z]) => window.__game!.worldToScreen(x!, z!), [x, z]);
}

async function waitFor(page: Page, pred: (s: Awaited<ReturnType<typeof state>>) => boolean, what: string) {
  await expect.poll(async () => pred(await state(page)), { message: what, timeout: 20_000 }).toBe(true);
}

test('M1: build straight, curved and crossing roads off the highway and zone them through the UI', async ({
  page,
}) => {
  const errs = watchErrors(page);
  await openGame(page);
  const s0 = await state(page);
  const cz = s0.highwayZ;
  // Look straight down-ish over the start area so clicks land where we expect.
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 260, z: cz, distance: 520, yaw: 0, tilt: 0.55 }),
    cz,
  );
  await page.evaluate(() => window.__game!.waitFrames(1));

  // Straight street by dragging from the highway connection.
  await page.getByTestId('tool-road').click();
  await expect(page.getByTestId('road-options')).toBeVisible();
  await page.getByTestId('road-street').click();
  let a = await screen(page, 24, cz);
  let b = await screen(page, 300, cz);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await waitFor(page, (s) => s.segments === s0.segments + 1, 'straight road built');
  const s1 = await state(page);
  expect(s1.treasury).toBeLessThan(s0.treasury);
  await page.keyboard.press('Escape');

  // Curved street: start, bend, end.
  await page.getByTestId('mode-curve').click();
  for (const [x, z] of [
    [300, cz],
    [430, cz],
    [460, cz + 130],
  ] as const) {
    const p = await screen(page, x, z);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await page.mouse.click(p.x, p.y);
  }
  await waitFor(page, (s) => s.segments === s1.segments + 1, 'curved road built');
  const s2 = await state(page);

  // Crossing avenue: splits the first street into a 4-way junction.
  await page.getByTestId('mode-straight').click();
  await page.getByTestId('road-avenue').click();
  a = await screen(page, 170, cz - 160);
  b = await screen(page, 170, cz + 170);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await waitFor(page, (s) => s.segments === s2.segments + 3, 'crossing avenue built and split');
  await page.keyboard.press('Escape');

  // Free-form dirt road.
  await page.getByTestId('road-dirt').click();
  await page.getByTestId('mode-free').click();
  const path: [number, number][] = [
    [240, cz + 40],
    [260, cz + 90],
    [300, cz + 120],
    [350, cz + 140],
  ];
  const s3 = await state(page);
  let p = await screen(page, path[0]![0], path[0]![1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (const [x, z] of path.slice(1)) {
    p = await screen(page, x, z);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  await page.mouse.up();
  await waitFor(page, (s) => s.segments > s3.segments, 'free-form road built');

  // Zone with the brush along both sides of the first street.
  await page.getByTestId('tool-zone').click();
  await page.getByTestId('zone-R').click();
  a = await screen(page, 40, cz + 30);
  b = await screen(page, 150, cz + 30);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('zone-C').click();
  a = await screen(page, 190, cz - 30);
  b = await screen(page, 290, cz - 30);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('zone-I').click();
  const shiftAt = await screen(page, 400, cz + 30);
  await page.keyboard.down('Shift');
  await page.mouse.click(shiftAt.x, shiftAt.y);
  await page.keyboard.up('Shift');
  await waitFor(page, (s) => s.zoned.R > 20 && s.zoned.C > 10 && s.zoned.I > 10, 'zones painted');

  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 250, z: cz + 20, distance: 430, yaw: 0.45, tilt: 0 }),
    cz,
  );
  await shot(page, 'm1-network');

  // Undo reverses the latest placement (the industrial fill), then the bulldozer removes a road.
  const before = await state(page);
  await page.getByTestId('tool-undo').click();
  await waitFor(page, (s) => s.zoned.I < before.zoned.I, 'undo reverted zoning');
  await page.evaluate(
    (cz) => window.__game!.setCamera({ x: 260, z: cz, distance: 520, yaw: 0, tilt: 0.55 }),
    cz,
  );
  await page.getByTestId('tool-bulldoze').click();
  const dz = await screen(page, 438.75, cz + 73.1);
  const beforeDoze = await state(page);
  await page.mouse.move(dz.x, dz.y, { steps: 2 });
  await page.mouse.click(dz.x, dz.y);
  await waitFor(page, (s) => s.segments === beforeDoze.segments - 1, 'bulldozed a road');

  errs.check();
});
