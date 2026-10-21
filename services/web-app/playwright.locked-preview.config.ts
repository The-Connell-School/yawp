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
