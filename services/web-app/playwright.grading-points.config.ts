import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.GRADING_POINTS_E2E_PORT);
if (!Number.isInteger(port) || port < 1024) throw new Error('An isolated grading E2E port is required');
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'teacher.grading-points.spec.ts',
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { baseURL: origin, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && E2E=true bun run dev -- --port ${port} --host 127.0.0.1 --strictPort'`,
    url: origin,
    reuseExistingServer: false,
    timeout: 240000,
  },
});
