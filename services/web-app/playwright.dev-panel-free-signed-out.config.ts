import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /dev-panel-free-signed-out\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  forbidOnly: !!process.env.CI,
  outputDir: `${process.env.TMPDIR}/dev-panel-free-signed-out-results`,
  use: {
    baseURL: process.env.DEMO_FEEDBACK_BASE_URL || 'http://127.0.0.1:5417',
    trace: 'off',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
