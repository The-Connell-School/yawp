import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL: 'http://127.0.0.1:5173',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command:
      "bash -c 'bun ./e2e/ensure-e2e-env.ts && if [ -f ./e2e/.env.e2e ]; then set -a && source ./e2e/.env.e2e && set +a; else export NODE_ENV=development; export DATABASE_PATH=./e2e/.e2e.sqlite; export CACHE_DATABASE_PATH=./e2e/.cache.sqlite; export DATABASE_URL=postgres://${PGUSER:-postgres}:${PGPASSWORD:-postgres}@127.0.0.1:${PGPORT:-54329}/yop_e2e; export HONEYPOT_SECRET=${HONEYPOT_SECRET:-dev-honeypot}; export AWS_S3_BUCKET_FOR_VIDEOS=${AWS_S3_BUCKET_FOR_VIDEOS:-e2e-bucket}; export AWS_S3_REGION_FOR_VIDEOS=${AWS_S3_REGION_FOR_VIDEOS:-us-east-1}; export SESSION_SECRET=${SESSION_SECRET:-dev-secret}; export INTERNAL_COMMAND_TOKEN=${INTERNAL_COMMAND_TOKEN:-dev-token}; export E2E=true; fi; E2E=true bun run dev -- --port 5173 --host 127.0.0.1 --strictPort'",
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 240 * 1000,
  },
});
