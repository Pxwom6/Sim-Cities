import { expect, test } from '@playwright/test';
import { buildTownViaApi, openGame, shot, watchErrors } from './helpers';

test('M3: the budget accounts for every dollar, taxes move demand, loans work, and bankruptcy ends the game', async ({
  page,
}) => {
  const errs = watchErrors(page);
  await openGame(page);
  await buildTownViaApi(page);
  await page.evaluate(() => window.__game!.advance(1440 * 3 + 200));

  await page.getByTestId('open-budget').click();
  const panel = page.getByTestId('budget');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Residential tax');
  await expect(panel).toContainText('Road maintenance');

  // Raise residential taxes with the real slider; the demand factor responds.
  await page.getByTestId('budget-tab-taxes').click();
  const before = await page.evaluate(() => window.__game!.getState());
  const beforeTax = before.demandFactors.R.find((f) => /tax/i.test(f.label))?.value ?? 0;
  for (const w of [0, 1, 2]) await page.getByTestId(`tax-R${w}`).fill('18');
  await page.evaluate(() => window.__game!.advance(60));
  const after = await page.evaluate(() => window.__game!.getState());
  const afterTax = after.demandFactors.R.find((f) => /tax/i.test(f.label))!.value;
  expect(afterTax).toBeLessThan(beforeTax - 0.2);

  // Take a loan from the loans tab.
  await page.getByTestId('budget-tab-loans').click();
  const t0 = (await page.evaluate(() => window.__game!.getState())).treasury;
  await page.getByTestId('loan-25000').click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__game!.getState())).treasury)
    .toBeGreaterThan(t0 + 20_000);

  await page.getByTestId('budget-tab-history').click();
  await shot(page, 'm3-budget-history');
  await page.getByTestId('budget-tab-overview').click();
  await shot(page, 'm3-budget');

  // Drain the treasury: the warning appears, then bankruptcy after the grace period.
  await page.evaluate(async () => {
    const g = window.__game!;
    const s = await g.getState();
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: -s.treasury - 200_000 });
    await g.advance(60);
  });
  await expect(page.getByTestId('money-warning')).toBeVisible();
  await page.evaluate(() => window.__game!.advance(60 * 50));
  await expect(page.getByTestId('bankrupt')).toBeVisible();
  await shot(page, 'm3-bankrupt');
  errs.check();
});
