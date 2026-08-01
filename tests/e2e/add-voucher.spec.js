import { test, expect } from './support/fixtures.js';
import { signUp, uniqueEmail } from './support/actions.js';

test('a user can add a voucher and see it in their wallet', async ({ page }) => {
  await signUp(page, { firstName: 'Rosalind', lastName: 'Franklin', email: uniqueEmail('voucher'), password: 'correct-horse-1' });

  await page.getByRole('button', { name: 'Add voucher' }).first().click();
  await page.getByRole('button', { name: 'Manual Entry' }).click();

  await page.getByPlaceholder('Search or type a brand…').fill('Bol.com');
  await page.getByPlaceholder('50,00').fill('75');
  await page.getByRole('button', { name: 'Add Voucher' }).click();

  await expect(page.locator('#toast')).toHaveText('Voucher saved');

  await page.getByRole('button', { name: 'Wallet' }).click();
  await expect(page.getByText('Bol.com')).toBeVisible();
  await expect(page.getByText('€75')).toBeVisible();
});

test('a valid amount is required to save a voucher', async ({ page }) => {
  await signUp(page, { firstName: 'Marie', lastName: 'Curie', email: uniqueEmail('voucher-invalid'), password: 'correct-horse-1' });

  await page.getByRole('button', { name: 'Add voucher' }).first().click();
  await page.getByRole('button', { name: 'Manual Entry' }).click();

  await page.getByPlaceholder('Search or type a brand…').fill('Zalando');
  await page.getByRole('button', { name: 'Add Voucher' }).click();

  await expect(page.locator('#toast')).toHaveText('Enter a valid amount');
});
