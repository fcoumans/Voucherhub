import { test, expect } from './support/fixtures.js';
import { signUp, addVoucher, uniqueEmail } from './support/actions.js';

test('a user can list a voucher for sale and see it under My Listings', async ({ page }) => {
  await signUp(page, { firstName: 'Katherine', lastName: 'Johnson', email: uniqueEmail('seller'), password: 'correct-horse-1' });
  await addVoucher(page, { brand: 'Bol.com', amount: '75' });

  await page.getByText('Bol.com').click();
  await page.getByRole('button', { name: 'Sell' }).click();
  await page.getByPlaceholder('e.g. 40,00').fill('50');
  await page.getByRole('button', { name: 'List for Sale' }).click();

  await expect(page.locator('#toast')).toHaveText('Listed on marketplace');

  await page.getByRole('button', { name: 'Market' }).click();
  await page.getByRole('button', { name: /My Listings/ }).click();

  await expect(page.getByText('Bol.com')).toBeVisible();
  await expect(page.getByText('€50')).toBeVisible();
});

// A seller's own listings must never appear in their own public Browse tab
// (viewMarketplace filters `sellerId !== uid`) — only in My Listings.
test('a seller does not see their own listing under Browse', async ({ page }) => {
  await signUp(page, { firstName: 'Mae', lastName: 'Jemison', email: uniqueEmail('seller-browse'), password: 'correct-horse-1' });
  await addVoucher(page, { brand: 'Zalando', amount: '30' });

  await page.getByText('Zalando').click();
  await page.getByRole('button', { name: 'Sell' }).click();
  await page.getByPlaceholder('e.g. 40,00').fill('20');
  await page.getByRole('button', { name: 'List for Sale' }).click();

  await page.getByRole('button', { name: 'Market' }).click();
  await expect(page.getByText('Marketplace is empty')).toBeVisible();
});
