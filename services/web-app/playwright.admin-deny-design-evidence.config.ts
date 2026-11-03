import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.APPROVAL_V2_BASE_URL;
if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
  throw new Error('Use localhost for APPROVAL_V2_BASE_URL');

const webServer = process.env.APPROVAL_V2_REUSE_DEV
  ? undefined
  : {
      command: `bash -c 'trap "../../bin/project dev stop --json" EXIT INT TERM; ../../bin/project dev start --json; node -e "setInterval(() => {}, 1000)"'`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120000,
      gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10000 },
      env: {
        FREE_TIER_LINK_HMAC_SECRET:
          process.env.FREE_TIER_LINK_HMAC_SECRET ??
          'local-approval-v2-test-secret',
        ...(process.env.E2E_DATABASE_URL
          ? {
              DATABASE_URL: process.env.E2E_DATABASE_URL,
              E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
            }
          : {}),
        PRIMARY_APP_URL: baseURL,
        FREE_TIER_APPROVAL_WORKER_ENABLED: 'false',
      },
    };

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'free-tier.admin-deny-design-evidence.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: `${process.env.TMPDIR}/admin-deny-design-evidence`,
  ...(webServer ? { webServer } : {}),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
});
