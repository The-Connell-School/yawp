import { defineConfig, devices } from '@playwright/test';
import {
  E2E_APP_ORIGIN,
  E2E_APP_PORT,
  E2E_STRIPE_BASE_URL,
} from './e2e/constants';

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
    baseURL: E2E_APP_ORIGIN,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'bun ./e2e/fake-stripe-server.ts',
      url: `${E2E_STRIPE_BASE_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
    {
      command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a; E2E=true bun run dev -- --port ${E2E_APP_PORT} --host 127.0.0.1 --strictPort'`,
      url: E2E_APP_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 240 * 1000,
    },
  ],
});
