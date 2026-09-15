import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.E2E_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use ./bin/project test --profile teacher-paste-browser');
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './e2e/tests', testMatch: 'teacher.paste-report.spec.ts',
  globalTeardown: './e2e/global-teardown.ts', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bash -c 'bun ./e2e/ensure-e2e-env.ts && set -a && source ./e2e/.env.e2e && set +a && E2E=true bun run dev -- --port ${port} --host 127.0.0.1 --strictPort'`,
    url: baseURL, reuseExistingServer: false, timeout: 240000,
  },
});
