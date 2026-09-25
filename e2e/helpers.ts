import { expect, type Page } from '@playwright/test';

/** Collects console errors and unhandled rejections; call `check()` at the end of a test. */
export function watchErrors(page: Page): { errors: string[]; check: () => void } {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return {
    errors,
    check: () => expect(errors, errors.join('\n')).toEqual([]),
  };
}

export async function openGame(page: Page, query = ''): Promise<void> {
  await page.goto(`/?paused=1${query}`);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => window.__game!.waitFrames(2));
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.__game!.waitFrames(2));
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
}

/** Same planned town as tests/helpers.ts `buildTown`, dispatched through the test API. */
export async function buildTownViaApi(page: Page, len = 480, streets = 4): Promise<void> {
  await page.evaluate(
    async ([len, streets]) => {
      const g = window.__game!;
      const s = await g.getState();
      const c = { x: 24, z: s.highwayZ };
      const ok = async (cmd: Parameters<typeof g.dispatch>[0]) => {
        const r = await g.dispatch(cmd);
        if (!r.ok) throw new Error(`${cmd.type} failed: ${r.reason}`);
      };
      await ok({ type: 'buildRoad', road: 'avenue', points: [c, { x: c.x + len!, z: c.z }] });
      for (let k = 1; k <= streets!; k++) {
        const x = c.x + (len! * k) / (streets! + 1);
        await ok({
          type: 'buildRoad',
          road: 'street',
          points: [
            { x, z: c.z - 160 },
            { x, z: c.z + 160 },
          ],
        });
      }
      const brush = (
        zone: 'R' | 'C' | 'I',
        a: { x: number; z: number },
        b: { x: number; z: number },
        radius: number,
      ) => ok({ type: 'zone', zone, area: { kind: 'brush', points: [a, b], radius } });
      await brush('R', { x: c.x + 20, z: c.z - 100 }, { x: c.x + len!, z: c.z - 100 }, 70);
      await brush('C', { x: c.x + 20, z: c.z + 20 }, { x: c.x + len!, z: c.z + 20 }, 22);
      await brush('R', { x: c.x + 20, z: c.z + 90 }, { x: c.x + len! / 2, z: c.z + 90 }, 50);
      await brush('I', { x: c.x + len! / 2 + 20, z: c.z + 110 }, { x: c.x + len!, z: c.z + 110 }, 50);
    },
    [len, streets],
  );
}

/** Power, water, sewage and garbage for the planned town (via the test API). */
export async function serveTownViaApi(page: Page): Promise<void> {
  const ok = await page.evaluate(async () => {
    const g = window.__game!;
    await g.dispatch({ type: 'cheat', cheat: 'unlockAll' });
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 80_000 });
    const s = await g.getState();
    const near = { x: 300, z: s.highwayZ + 170 };
    const ids = [];
    for (const def of ['coal', 'pump', 'pump', 'treatment', 'landfill'])
      ids.push(await g.placeCivic(def, near));
    return ids.every((x) => x !== null);
  });
  expect(ok).toBe(true);
}
