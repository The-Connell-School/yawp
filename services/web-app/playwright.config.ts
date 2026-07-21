import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT ?? '5173');
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort > 65_535) {
  throw new Error(`E2E_PORT must be an integer between 1 and 65535, got ${process.env.E2E_PORT}`);
}
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL: e2eBaseUrl,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a; E2E=true bun run dev -- --port ${e2ePort} --host 127.0.0.1 --strictPort'`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 240 * 1000,
  },
});
