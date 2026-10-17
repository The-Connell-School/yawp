import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /auth\.unified-join-link\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: `${process.env.TMPDIR}/join-link-playwright-results`,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5268',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
