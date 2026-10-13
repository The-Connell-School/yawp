import { defineConfig, devices } from '@playwright/test';

const appPort = Number(process.env.FREE_TIER_QA_APP_PORT || '5175');
const appUrl = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: appUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--host-resolver-rules=MAP ua.localhost 127.0.0.1'],
          ...(process.env.PW_EXECUTABLE_PATH
            ? { executablePath: process.env.PW_EXECUTABLE_PATH }
            : {}),
        },
      },
    },
  ],
  webServer: [
    {
      command: 'bun ./e2e/fake-stripe-server.ts',
      url: 'http://127.0.0.1:12111/health',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && E2E=true TESTER_FEEDBACK_ENABLED=true bun run dev -- --port ${appPort} --host 127.0.0.1 --strictPort'`,
      url: appUrl,
      reuseExistingServer: false,
      timeout: 240 * 1000,
    },
  ],
});
