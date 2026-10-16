import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.SIGNON_RESEND_PORT || 5396);
export default defineConfig({
  testDir: './e2e/tests', testMatch: /auth\.unified-resend\.spec\.ts/,
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: !!process.env.CI,
  reporter: 'list', outputDir: process.env.TMPDIR + '/resend-browser-results',
  use: {
    baseURL: `http://localhost:${port}`, trace: 'off', screenshot: 'off',
    launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bun x vite --config e2e/vite.resend.config.ts --host localhost --port ${port} --strictPort`,
    url: `http://localhost:${port}/auth/login`, reuseExistingServer: false, timeout: 120000,
  },
});
