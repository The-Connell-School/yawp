import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT } from './e2e/constants';

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
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL: E2E_BASE_URL,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The test server binds IPv4; avoid another local app on IPv6 loopback.
        launchOptions: {
          args: ['--host-resolver-rules=MAP ua.localhost 127.0.0.1'],
          ...(process.env.PW_EXECUTABLE_PATH
            ? { executablePath: process.env.PW_EXECUTABLE_PATH }
            : {}),
        },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'bun ./e2e/fake-stripe-server.ts',
      url: 'http://127.0.0.1:12111/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
    {
      command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && E2E=true bun run dev -- --port ${E2E_PORT} --host 127.0.0.1 --strictPort'`,
      url: E2E_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240 * 1000,
    },
  ],
});
