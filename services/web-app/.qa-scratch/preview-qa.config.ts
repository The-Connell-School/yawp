import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'seed-generator-qa.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 300_000,
  use: {
    baseURL: 'https://pr-245.preview.yawp.school',
    viewport: { width: 1440, height: 900 },
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
