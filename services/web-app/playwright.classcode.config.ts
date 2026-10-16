import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/tests', testMatch: /auth\.unified-classcode\.spec\.ts/,
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: !!process.env.CI,
  reporter: 'list', outputDir: process.env.TMPDIR + '/classcode-playwright-results',
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:5396', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
