import { defineConfig, devices } from '@playwright/test';

// Uses the worktree's disposable E2E database and captured mail. No hosted URLs.
const port = Number(process.env.E2E_PORT || 5211);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /free-tier\.(onboarding-style|onboarding|event-waitlist|disabled-expired|legal)\.spec\.ts/,
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && E2E=true PRIMARY_APP_URL=${baseURL} bun run dev -- --port ${port} --host 127.0.0.1 --strictPort'`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240000,
  },
});
