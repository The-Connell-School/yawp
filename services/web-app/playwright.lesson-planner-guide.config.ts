import { defineConfig, devices } from '@playwright/test';

/**
 * Re-records the Lesson Planner guide's clips (e2e/tools). Not a test run:
 * start the e2e dev server on :5173 first, then
 *   bunx playwright test -c playwright.lesson-planner-guide.config.ts
 */
export default defineConfig({
  testDir: './e2e/tools',
  // Not *.spec.ts, so no other config or bun test ever picks it up.
  testMatch: 'record-lesson-planner-guide.ts',
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
