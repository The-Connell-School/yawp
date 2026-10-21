import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.APPROVAL_V2_BASE_URL;
if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
  throw new Error('Use the isolated approval-v2 project profile');
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'free-tier.approval-v2.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: `${process.env.TMPDIR}/approval-v2-playwright`,
  webServer: {
    command: `bash -c 'trap "../../bin/project dev stop --json" EXIT INT TERM; ../../bin/project dev start --json; node -e "setInterval(() => {}, 1000)"'`,
    url: baseURL,
    reuseExistingServer: !!process.env.APPROVAL_V2_REUSE_DEV,
    timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    env: {
      CACHE_DATABASE_PATH: `${process.env.TMPDIR}/approval-v2-cache.sqlite`,
      DATABASE_PATH: `${process.env.TMPDIR}/approval-v2-local.sqlite`,
      SIGNON_MAIL_CAPTURE_DIR: `${process.env.TMPDIR}/approval-v2-mail`,
      FREE_TIER_LINK_HMAC_SECRET:
        process.env.FREE_TIER_LINK_HMAC_SECRET ??
        'local-approval-v2-test-secret',
      DATABASE_URL: process.env.E2E_DATABASE_URL,
      E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
      PRIMARY_APP_URL: baseURL,
      FREE_TIER_APPROVAL_WORKER_ENABLED: 'false',
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
});
