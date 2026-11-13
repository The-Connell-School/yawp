import { defineConfig, devices } from '@playwright/test';

const browserGateDeferred = process.env.LOCKED_PREVIEW_BROWSER_DEFERRED === '1';
const deferredMatch = /locked-preview-browser-deferred\.spec\.ts/;
const fullMatch = /free-tier\.locked-preview\.spec\.ts/;

// Owned local server/database come from ./bin/project; no shared E2E reset.
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: browserGateDeferred ? deferredMatch : fullMatch,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: `${process.env.TMPDIR}/locked-preview-playwright`,
  ...(browserGateDeferred
    ? {}
    : {
        webServer: {
          // The project profile supplies the isolated database, port, and pinned
          // runtime. Keep this process in the foreground so Playwright owns its
          // entire process group even in a sandbox with a private PID namespace.
          command: `bun run dev -- --port ${process.env.CLASS_STEP_PORT} --host 127.0.0.1 --strictPort`,
          url: `http://localhost:${process.env.CLASS_STEP_PORT}`,
          reuseExistingServer: false,
          timeout: 180000,
          env: {
            CACHE_DATABASE_PATH: `${process.env.TMPDIR}/locked-preview-cache.sqlite`,
            DATABASE_PATH: `${process.env.TMPDIR}/locked-preview-local.sqlite`,
            SIGNON_MAIL_CAPTURE_DIR: `${process.env.TMPDIR}/locked-preview-mail`,
            FREE_TIER_LINK_HMAC_SECRET: 'local-locked-preview-test-signing-secret',
            PRIMARY_APP_URL: `http://localhost:${process.env.CLASS_STEP_PORT}`,
            YAWP_ENVIRONMENT: 'demo',
          },
        },
      }),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${process.env.CLASS_STEP_PORT}`,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
});
