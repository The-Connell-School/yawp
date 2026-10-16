import { defineConfig, devices } from '@playwright/test';
if (!process.env.FREE_BUNDLE_BASE_URL || !process.env.E2E_DATABASE_URL)
  throw new Error('An isolated local runtime and database are required');
const url = new URL(process.env.FREE_BUNDLE_BASE_URL);
const database = new URL(process.env.E2E_DATABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(database.hostname) ||
  !database.pathname.startsWith('/yawp_')
)
  throw new Error('An isolated project fixture database is required');
if (!['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('Local verification only');
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'free-tier.assignment-choices.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: 'line',
  use: {
    baseURL: url.origin,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
