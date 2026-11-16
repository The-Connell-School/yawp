import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.BRIAN_FIXES_PORT || 5496);

// Database-free browser regressions; deliberately no global setup or teardown.
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /brian-nov15-fixes\.spec\.ts/,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: '/tmp/yawp-brian-fixes-playwright',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bun x --no-install vite --config vite.free-tier-welcome.config.ts --port ${port} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${port}/e2e/fixtures/brian-fixes/index.html`,
    reuseExistingServer: false,
  },
});
