import { defineConfig } from '@playwright/test';
import base from './playwright.unified-backend.config';
export default defineConfig({
  ...base,
  webServer: {
    command:
      'bun x vite --config e2e/vite.recovery.config.ts --host localhost --port 5396 --strictPort',
    url: 'http://localhost:5396/auth/preview-access',
    reuseExistingServer: false,
    timeout: 120000,
  },
  testMatch: /auth\.unified-recovery\.spec\.ts/,
});
