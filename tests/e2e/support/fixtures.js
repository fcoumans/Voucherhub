import { test as base, expect } from '@playwright/test';
import { createDb, installSupabaseMock } from './supabase-mock.js';

// Every test gets its own empty in-memory "backend" and has the default
// `page` pre-wired to it. Tests that need a second signed-in user (the gift
// flow) open an extra context/page and call installSupabaseMock(page, db)
// on it directly, sharing the same db so both "users" see the same data.
export const test = base.extend({
  db: async ({}, use) => {
    await use(createDb());
  },
  page: async ({ page, db }, use) => {
    await installSupabaseMock(page, db);
    await use(page);
  },
});

export { expect, installSupabaseMock };
