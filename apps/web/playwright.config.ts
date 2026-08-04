import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// The webServer below runs `pnpm dev`, which reads apps/web/.env.local. Load the
// same file here so the specs and the server they talk to agree — otherwise a
// developer who sets TEST_LOGIN_SECRET in .env.local gets 401 on every E2E
// sign-in, because the server enforces a secret the specs never send.
config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm --filter web exec tsx src/scripts/seed.ts && pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
