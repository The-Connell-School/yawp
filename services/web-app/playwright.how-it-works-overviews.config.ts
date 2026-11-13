import { defineConfig, devices } from '@playwright/test';

/**
 * Records the overview video at the top of each How It Works page (Class
 * Starter, Pre-Writing, Thesis Statement, Exit Ticket) from the real app with
 * demo data (e2e/tools). Not a test run, and it leaves the e2e database up:
 * start the e2e dev server on :5173 first, then
 *   bunx playwright test -c playwright.how-it-works-overviews.config.ts
 */
export default defineConfig({
  testDir: './e2e/tools',
  // Not *.spec.ts, so no other config or bun test ever picks it up.
  testMatch: process.env.HOW_IT_WORKS_TOOL ?? 'record-how-it-works-overviews.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // A step that can't find its target fails in seconds instead of hanging the take.
    actionTimeout: 20_000,
    launchOptions: process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
