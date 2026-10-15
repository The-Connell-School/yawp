import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /auth\.unified-(google-)?backend\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: process.env.TMPDIR + '/signon-playwright-results',
  use: {
    baseURL: 'http://localhost:5396',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH },
  },
  webServer:
    process.env.SIGNON_START_SERVER === '1'
      ? {
          command: 'bun run dev -- --host localhost --port 5396 --strictPort',
          url: 'http://localhost:5396',
          reuseExistingServer: false,
          timeout: 120000,
        }
      : undefined,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
