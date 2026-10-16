import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.FREE_TIER_E2E_PORT || 5197);
const baseURL = `http://127.0.0.1:${port}`;
const internalApiKeys = JSON.stringify([
  {
    id: 'e2e-free-tier-release-management',
    secret: 'e2e-free-tier-release-management-secret-00000000',
    scopes: ['management:write'],
  },
]);
const internalApiKeysEnv = JSON.stringify(internalApiKeys);

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
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
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
    {
      command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && E2E=true TESTER_FEEDBACK_ENABLED=true PRIMARY_APP_URL=${baseURL} LEGACY_INTERNAL_KEY_ALLOWED=false INTERNAL_API_NONCE_STORE=memory YAWP_INTERNAL_API_KEYS=${internalApiKeysEnv} bun run dev -- --port ${port} --host 127.0.0.1 --strictPort'`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 240 * 1000,
    },
  ],
});
