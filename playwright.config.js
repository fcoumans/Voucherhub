import { defineConfig, devices } from '@playwright/test';

// The app talks directly to Supabase (auth + REST + RPC) with no server of
// its own, so these values just need to look like a real project — the
// tests intercept every request to them at the network layer (see
// tests/e2e/support/supabase-mock.js) rather than hitting a real backend.
// Nothing here is a secret; it's never a live Supabase project.
const FAKE_SUPABASE_ENV = 'VITE_SUPABASE_URL=https://vh-e2e.supabase.co VITE_SUPABASE_ANON_KEY=e2e-test-anon-key';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Rebuilds with the fake env baked in, then serves the static build —
    // this is what actually exercises the production `vite build` output,
    // not just the dev server.
    command: `${FAKE_SUPABASE_ENV} npm run build && npm run preview -- --port 4173 --strictPort`,
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
