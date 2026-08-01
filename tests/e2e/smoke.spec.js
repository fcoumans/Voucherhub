import { test, expect } from './support/fixtures.js';
import { signUp, uniqueEmail } from './support/actions.js';

// Not a behavior test — just confirms every nav destination (including
// Profile, Discover, Referrals, Friends) renders without a JS error. These
// views aren't otherwise covered by the suite, so this is what would catch
// a broken import/wiring in them.
test('smoke: every nav tab + profile renders without console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await signUp(page, { firstName: 'Smoke', lastName: 'Test', email: uniqueEmail('smoke'), password: 'correct-horse-1' });

  for (const navName of ['Discover', 'Wallet', 'Market', 'Referrals', 'Home']) {
    await page.getByRole('button', { name: navName, exact: true }).click();
    await page.waitForTimeout(200);
  }

  await page.locator('[data-nav="profile"]').click();
  await expect(page.getByText('Log Out')).toBeVisible();
  await page.getByText('Friends', { exact: true }).click();
  await expect(page.getByText('Send Friend Request')).toBeVisible();

  expect(errors, `Console/page errors found:\n${errors.join('\n')}`).toEqual([]);
});
