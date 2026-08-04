import { defineConfig, devices } from '@playwright/test';

const port = 5174;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e-gated',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL,
  },
  projects: [
    {
      name: 'preview-access-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      "bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && bun run --cwd ../../packages/prisma seed-local-dev && exec env PREVIEW_ACCESS_GATE=on PREVIEW_DATA_MODE=seed PREVIEW_ACCESS_CODES=brave-otter-4193 PREVIEW_ACCESS_SECRET=e2e-preview-access-secret E2E=true bun run dev -- --port 5174 --host 127.0.0.1 --strictPort'",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240 * 1000,
  },
});
