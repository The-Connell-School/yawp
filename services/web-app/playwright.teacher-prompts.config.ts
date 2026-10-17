import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

if (!process.env.TMPDIR) throw Error('TMPDIR is required');
process.env.SIGNON_TEACHER_PROMPTS_MOCK_STATE = path.join(
  process.env.TMPDIR,
  'teacher-prompts-mock-state.json'
);
if (!fs.existsSync(process.env.SIGNON_TEACHER_PROMPTS_MOCK_STATE))
  fs.writeFileSync(
    process.env.SIGNON_TEACHER_PROMPTS_MOCK_STATE,
    '{"teacherPrompts":true}'
  );
const port = Number(process.env.SIGNON_TEACHER_PROMPTS_PORT || 5397);
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /auth\.unified-teacher-prompts\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: path.join(process.env.TMPDIR, 'teacher-prompts-results'),
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: `bun x vite --config vite.teacher-prompts-test.config.ts --host localhost --port ${port} --strictPort`,
    url: `http://localhost:${port}/auth/login`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
