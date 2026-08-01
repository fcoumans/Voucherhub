// Shared UI actions used across multiple flow specs, so each spec reads as
// the flow it's actually testing rather than re-deriving "how do I sign up"
// every time.
import { expect } from '@playwright/test';

let counter = 0;
export function uniqueEmail(prefix = 'test-user') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

export async function signUp(page, { firstName, lastName, email, password }) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByLabel('First Name').fill(firstName);
  await page.getByLabel('Last Name').fill(lastName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('h2')).toContainText(firstName, { timeout: 10_000 });
}

export async function logIn(page, { email, password }) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.locator('#form-login').getByRole('button', { name: 'Log In' }).click();
}

export async function addVoucher(page, { brand, amount }) {
  await page.getByRole('button', { name: 'Add voucher' }).first().click();
  await page.getByRole('button', { name: 'Manual Entry' }).click();
  await page.getByPlaceholder('Search or type a brand…').fill(brand);
  await page.getByPlaceholder('50,00').fill(amount);
  await page.getByRole('button', { name: 'Add Voucher' }).click();
  await expect(page.locator('#toast')).toHaveText('Voucher saved');
}
