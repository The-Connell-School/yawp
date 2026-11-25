import { defineConfig, devices } from '@playwright/test';

/**
 * Records the 20–30 second marketing demos (e2e/tools/record-marketing-demos.ts)
 * from the real app with demo data. Not a test run, and it leaves the e2e
 * database up: start the e2e dev server on :5173 first, then
 *   bunx playwright test -c playwright.marketing-demos.config.ts
 */
export default defineConfig({
  testDir: './e2e/tools',
  // Not *.spec.ts, so no other config or bun test ever picks it up.
  testMatch: 'record-marketing-demos.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    actionTimeout: 20_000,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
