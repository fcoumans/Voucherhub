import { test, expect, installSupabaseMock } from './support/fixtures.js';
import { signUp, addVoucher, uniqueEmail } from './support/actions.js';

test('sending a gift moves the voucher to the recipient once claimed', async ({ page, db, browser }) => {
  // Sender: sign up, add a voucher, send it as a gift and grab the claim link.
  await signUp(page, { firstName: 'Sender', lastName: 'One', email: uniqueEmail('sender'), password: 'correct-horse-1' });
  await addVoucher(page, { brand: 'IKEA', amount: '40' });

  await page.getByText('IKEA').click();
  await page.getByRole('button', { name: 'Gift' }).click();
  await page.getByRole('button', { name: 'Send' }).click();

  const claimUrl = await page.locator('#gift-link-input').inputValue();
  expect(claimUrl).toContain('?gift=');

  await page.getByRole('button', { name: 'Done' }).click();
  // "Done" lands on Pending Gifts (after an async refetch), where the
  // still-unclaimed gift is expected to show. Wait for the header to
  // confirm the navigation landed before asserting on page content, and
  // scope to <main> since the voucher-detail header also reads "IKEA".
  await expect(page.locator('.header-title')).toHaveText('Pending Gifts');
  await expect(page.getByRole('main').getByText('IKEA')).toBeVisible();
  await page.getByRole('button', { name: 'Wallet' }).click();
  await expect(page.getByText('IKEA')).toHaveCount(0); // left the sender's wallet

  // Recipient: separate signed-in session, same fake backend, opens the link.
  const recipientContext = await browser.newContext();
  const recipientPage = await recipientContext.newPage();
  await installSupabaseMock(recipientPage, db);
  await signUp(recipientPage, { firstName: 'Recipient', lastName: 'Two', email: uniqueEmail('recipient'), password: 'correct-horse-1' });

  const giftPath = new URL(claimUrl).pathname + new URL(claimUrl).search;
  await recipientPage.goto(giftPath);

  await expect(recipientPage.getByText(/received a gift|IKEA/i).first()).toBeVisible();
  await recipientPage.goto('/');
  await recipientPage.getByRole('button', { name: 'Wallet' }).click();
  await expect(recipientPage.getByText('IKEA')).toBeVisible();

  await recipientContext.close();
});

test('an already-claimed gift link cannot be claimed twice', async ({ page, db, browser }) => {
  await signUp(page, { firstName: 'Sender', lastName: 'Two', email: uniqueEmail('sender2'), password: 'correct-horse-1' });
  await addVoucher(page, { brand: 'Decathlon', amount: '25' });
  await page.getByText('Decathlon').click();
  await page.getByRole('button', { name: 'Gift' }).click();
  await page.getByRole('button', { name: 'Send' }).click();
  const claimUrl = await page.locator('#gift-link-input').inputValue();
  const giftPath = new URL(claimUrl).pathname + new URL(claimUrl).search;

  const firstRecipient = await browser.newContext();
  const firstRecipientPage = await firstRecipient.newPage();
  await installSupabaseMock(firstRecipientPage, db);
  await signUp(firstRecipientPage, { firstName: 'First', lastName: 'Claimer', email: uniqueEmail('claimer1'), password: 'correct-horse-1' });
  await firstRecipientPage.goto(giftPath);
  await expect(firstRecipientPage.getByText(/received a gift|Decathlon/i).first()).toBeVisible();
  await firstRecipient.close();

  const secondRecipient = await browser.newContext();
  const secondRecipientPage = await secondRecipient.newPage();
  await installSupabaseMock(secondRecipientPage, db);
  await signUp(secondRecipientPage, { firstName: 'Second', lastName: 'Claimer', email: uniqueEmail('claimer2'), password: 'correct-horse-1' });
  await secondRecipientPage.goto(giftPath);

  await expect(secondRecipientPage.locator('#toast')).toHaveText(/no longer valid/i);
  await secondRecipientPage.getByRole('button', { name: 'Wallet' }).click();
  await expect(secondRecipientPage.getByText('Decathlon')).toHaveCount(0);

  await secondRecipient.close();
});
