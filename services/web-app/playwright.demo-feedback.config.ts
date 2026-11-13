import { defineConfig, devices } from '@playwright/test';

const browserGateDeferred = process.env.DEMO_FEEDBACK_BROWSER_DEFERRED === '1';
const deferredMatch = /demo-feedback-browser-deferred\.spec\.ts/;
const fullBrowserMatch =
  /(?:demo-feedback|dev-panel-artboard-evidence|dev-panel-free-tier-jumps|dev-panel-class-simulation)\.spec\.ts/;

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: browserGateDeferred ? deferredMatch : fullBrowserMatch,
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
