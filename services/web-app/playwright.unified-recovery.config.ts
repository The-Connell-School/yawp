import { defineConfig } from '@playwright/test';
import base from './playwright.unified-backend.config';
export default defineConfig({
  ...base,
  testMatch: /auth\.unified-recovery\.spec\.ts/,
});
