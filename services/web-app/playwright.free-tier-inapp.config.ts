import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.FREE_INAPP_BASE_URL;
if (
  !baseURL ||
  !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)
) {
  throw new Error(
    'Run the free-tier-inapp project profile against its isolated local server.'
  );
}
export default defineConfig({
  testDir: './e2e/tests',
  testMatch:
    process.env.FREE_INAPP_REGRESSION === 'bundle'
      ? /free-tier\.bundle-quotas\.spec\.ts/
      : process.env.FREE_INAPP_REGRESSION === '1'
        ? /free-tier\.(bundle-quotas|assignment-choices)\.spec\.ts/
        : /free-tier\.inapp\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir:
    process.env.FREE_INAPP_TEST_OUTPUT ??
    `${process.env.TMPDIR}/free-tier-inapp-playwright`,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
