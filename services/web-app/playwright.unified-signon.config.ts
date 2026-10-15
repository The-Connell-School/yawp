import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.SIGNON_FIXTURE_PORT || 5293);
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /auth\.unified-signon\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bun x vite --config vite.signon-fixtures.config.ts --port ${port} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${port}/e2e/fixtures/unified-signon/index.html`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
