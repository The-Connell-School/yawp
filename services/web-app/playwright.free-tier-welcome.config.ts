import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.FREE_WELCOME_PORT || 5397);
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /free-tier\.welcome-components\.spec\.ts/,
  workers: 1,
  timeout: 10000,
  expect: { timeout: 3000 },
  fullyParallel: false,
  maxFailures: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: process.env.TMPDIR + '/fto-free-page-playwright',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bun x vite --config vite.free-tier-welcome.config.ts --port ${port} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${port}/e2e/fixtures/free-tier-welcome/index.html`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
