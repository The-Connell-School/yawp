import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /auth\.preview-seat-policy\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: process.env.TMPDIR + '/seat-policy/playwright',
  use: {
    baseURL: 'http://localhost:5397',
    trace: 'off',
    screenshot: 'off',
    launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH },
  },
});
