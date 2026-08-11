import { test, expect } from './support/fixtures.js';
import { uniqueEmail } from './support/actions.js';

test('the value carousel walks through all four pillar slides, supports Back, and reaches signup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();

  await expect(page.getByText('Never let another gift card expire')).toBeVisible();
  await expect(page.getByText('Wallet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Discover and share codes')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Turn dead value into real value')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Discover your next gift card')).toBeVisible();

  // Back returns to the previous slide instead of leaving the carousel.
  await page.locator('.onboarding-back').click();
  await expect(page.getByText('Turn dead value into real value')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Final slide's primary CTA relabels to "Get started" and goes to signup.
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByLabel('First Name')).toBeVisible();
});

test('the carousel can be skipped straight to signup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByLabel('First Name')).toBeVisible();
});

test('picking Sustainability grants the Planet B welcome gift', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByLabel('First Name').fill('Ada');
  await page.getByLabel('Last Name').fill('Lovelace');
  await page.getByLabel('Email').fill(uniqueEmail('onboarding-gift'));
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-1');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByText('VoucherWise, full of surprises')).toBeVisible();
  await page.getByRole('button', { name: 'Sustainability' }).click();
  await page.getByRole('button', { name: 'Reveal my gift' }).click();

  await expect(page.getByText('Your welcome gift!')).toBeVisible();
  await expect(page.locator('#ob-gift-card').getByText('Planet B')).toBeVisible();
  await page.getByRole('button', { name: 'Awesome!' }).click();

  // The one-time "discover more" nudge follows the gift reveal.
  await expect(page.getByText("There's more to discover")).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();

  await page.getByRole('button', { name: 'Wallet' }).click();
  await expect(page.getByText('Planet B')).toBeVisible();
});

test('skipping interests lands on Home with no welcome-gift voucher', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByLabel('First Name').fill('Grace');
  await page.getByLabel('Last Name').fill('Hopper');
  await page.getByLabel('Email').fill(uniqueEmail('onboarding-skip'));
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-1');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByText('VoucherWise, full of surprises')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page.locator('h2')).toContainText('Grace');
  await expect(page.getByText("There's more to discover")).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();

  await page.getByRole('button', { name: 'Wallet' }).click();
  await expect(page.getByText('Planet B')).toHaveCount(0);
});
