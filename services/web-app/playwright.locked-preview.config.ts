import { defineConfig, devices } from '@playwright/test';

// Owned local server/database come from ./bin/project; no shared E2E reset.
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'free-tier.locked-preview.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: `${process.env.TMPDIR}/locked-preview-playwright`,
  webServer: {
    command: `bash -c 'trap "../../bin/project dev stop --json" EXIT INT TERM; ../../bin/project dev start --json; node -e "setInterval(() => {}, 1000)"'`,
    url: `http://localhost:${process.env.CLASS_STEP_PORT}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      CACHE_DATABASE_PATH: `${process.env.TMPDIR}/locked-preview-cache.sqlite`,
      DATABASE_PATH: `${process.env.TMPDIR}/locked-preview-local.sqlite`,
      SIGNON_MAIL_CAPTURE_DIR: `${process.env.TMPDIR}/locked-preview-mail`,
      FREE_TIER_LINK_HMAC_SECRET: 'local-locked-preview-test-signing-secret',
      PRIMARY_APP_URL: `http://localhost:${process.env.CLASS_STEP_PORT}`,
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${process.env.CLASS_STEP_PORT}`,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
});
