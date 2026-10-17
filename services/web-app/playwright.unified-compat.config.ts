import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.E2E_PORT || 5292);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './e2e/tests',
  testMatch:
    /auth\.(unified-compat|signin|free-tier-handle-join)\.spec\.ts|free-tier\.trial-status\.spec\.ts/,
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && E2E=true PRIMARY_APP_URL=${baseURL} bun run dev -- --port ${port} --host 127.0.0.1 --strictPort'`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240000,
  },
});
