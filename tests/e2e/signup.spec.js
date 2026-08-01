import { test, expect, installSupabaseMock } from './support/fixtures.js';
import { signUp, logIn, uniqueEmail } from './support/actions.js';

test('a new user can sign up and lands on Home', async ({ page }) => {
  const email = uniqueEmail('signup');
  await signUp(page, { firstName: 'Ada', lastName: 'Lovelace', email, password: 'correct-horse-1' });

  await expect(page.locator('h2')).toHaveText('Ada');
  await expect(page.getByText(/Active/i)).toBeVisible();
});

test('signing up with an already-registered email shows an error', async ({ page, db, browser }) => {
  const email = uniqueEmail('dupe');
  await signUp(page, { firstName: 'Grace', lastName: 'Hopper', email, password: 'correct-horse-1' });

  // Fresh browser context (no session in localStorage) sharing the same
  // fake backend, so this re-signup hits the same already-registered email.
  const context = await browser.newContext();
  const secondPage = await context.newPage();
  await installSupabaseMock(secondPage, db);

  await secondPage.goto('/');
  await secondPage.getByRole('button', { name: 'Get started' }).click();
  await secondPage.getByLabel('First Name').fill('Grace');
  await secondPage.getByLabel('Last Name').fill('Hopper');
  await secondPage.getByLabel('Email').fill(email);
  await secondPage.getByLabel('Password', { exact: true }).fill('another-password-1');
  await secondPage.getByRole('button', { name: 'Create Account' }).click();

  await expect(secondPage.getByText(/already registered/i)).toBeVisible();
  await context.close();
});

test('a returning user can log in', async ({ page }) => {
  const email = uniqueEmail('login');
  await signUp(page, { firstName: 'Alan', lastName: 'Turing', email, password: 'correct-horse-1' });

  await page.evaluate(() => localStorage.clear());
  await logIn(page, { email, password: 'correct-horse-1' });

  await expect(page.locator('h2')).toHaveText('Alan');
});
