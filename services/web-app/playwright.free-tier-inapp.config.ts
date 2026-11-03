import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.FREE_INAPP_BASE_URL;
if (
  !baseURL ||
  !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)
) {
  throw new Error(
    'Run the free-tier-inapp project profile against its isolated local server.'
  );
}
export default defineConfig({
  testDir: './e2e/tests',
  testMatch:
    process.env.FTO_LIMITS_BROWSER === '1'
      ? /free-tier\.monthly-dashboard\.spec\.ts/
      : process.env.FREE_INAPP_REGRESSION === 'handle'
        ? /auth\.free-tier-handle-join\.spec\.ts/
        : process.env.FREE_INAPP_REGRESSION === 'navigation'
          ? /(auth\.free-tier-handle-join|free-tier\.trial-status)\.spec\.ts/
          : process.env.FREE_INAPP_REGRESSION === 'bundle'
            ? /free-tier\.bundle-quotas\.spec\.ts/
            : process.env.FREE_INAPP_REGRESSION === '1'
              ? /free-tier\.(bundle-quotas|assignment-choices)\.spec\.ts/
              : /free-tier\.(inapp|site-license-locked-tiles)\.spec\.ts/,
  grep:
    process.env.FREE_INAPP_CONTROLS === '1'
      ? /free-account legacy controls/
      : undefined,
  timeout: process.env.FTO_LIMITS_BROWSER === '1' ? 90000 : 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir:
    process.env.FREE_INAPP_TEST_OUTPUT ??
    `${process.env.TMPDIR}/free-tier-inapp-playwright`,
  ...(process.env.FTO_LIMITS_BROWSER === '1'
    ? {
        webServer: {
          command: `bash -c 'trap "../../bin/project dev stop --json" EXIT INT TERM; ../../bin/project dev start --json; node -e "setInterval(() => {}, 1000)"'`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120000,
          gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10000 },
          env: {
            CACHE_DATABASE_PATH: `${process.env.TMPDIR}/monthly-cache.sqlite`,
            DATABASE_PATH: `${process.env.TMPDIR}/monthly-local.sqlite`,
            FREE_TIER_APPROVAL_WORKER_ENABLED: 'false',
            FREE_TIER_LINK_HMAC_SECRET: 'local-monthly-test-secret',
            PRIMARY_APP_URL: baseURL,
          },
        },
      }
    : {}),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--disable-gpu', '--force-color-profile=srgb'],
      ...(process.env.PW_EXECUTABLE_PATH
        ? { executablePath: process.env.PW_EXECUTABLE_PATH }
        : {}),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
