import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/tests', testMatch: 'classcode-unique.spec.ts', workers: 1, retries: 0,
  reporter: 'list', outputDir: process.env.TMPDIR + '/classcode-playwright',
  use: { ...devices['Desktop Chrome'], baseURL: process.env.CLASSCODE_URL,
    launchOptions: process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : undefined },
});
