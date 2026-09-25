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
