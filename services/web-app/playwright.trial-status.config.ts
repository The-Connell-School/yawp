import { defineConfig, devices } from '@playwright/test';

// Use the disposable runtime from ./bin/project qa prepare.
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'free-tier.trial-status.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.TRIAL_STATUS_BASE_URL || 'http://127.0.0.1:5227',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {},
  },
});
