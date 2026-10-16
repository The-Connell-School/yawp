import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /auth\.preview-fixtures\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: process.env.TMPDIR + '/di-signon-preview-fixtures/playwright',
  use: {
    baseURL: 'http://localhost:5396',
    trace: 'off',
    screenshot: 'off',
    launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH },
  },
});
