import { defineConfig, devices } from '@playwright/test';

// Start the isolated runtime with ./bin/project qa prepare first.
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'free-tier.classroom-report.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.REPORT_BASE_URL || 'http://127.0.0.1:48320',
    viewport: { width: 1280, height: 900 },
    launchOptions: process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {},
  },
});
