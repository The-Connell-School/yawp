import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/tests',
  testMatch:
    /demo-feedback\.spec\.ts|dev-panel-artboard-evidence\.spec\.ts|dev-panel-free-tier-jumps\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list', { printSteps: true }]],
  forbidOnly: !!process.env.CI,
  outputDir: `${process.env.TMPDIR}/demo-feedback-results`,
  use: {
    baseURL: process.env.DEMO_FEEDBACK_BASE_URL || 'http://127.0.0.1:5417',
    trace: 'off',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
