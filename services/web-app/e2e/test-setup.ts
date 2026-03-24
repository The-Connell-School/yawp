import { test as base } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { E2EContext } from './seed-e2e';

type TestFixtures = {
  signIn: (email: string, password: string) => Promise<void>;
  e2eContext: E2EContext;
};

export const test = base.extend<TestFixtures>({
  e2eContext: async ({}, use) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const e2eDir = path.resolve(__dirname, '.');
    const ctxPath = path.join(e2eDir, '.e2e-context.json');
    const envPath = path.join(e2eDir, '.env.e2e');
    if (!fs.existsSync(ctxPath)) {
      const { prepareE2E } = await import('./prepare-e2e');
      await prepareE2E();
    }

    if (fs.existsSync(envPath)) {
      const envEntries = fs
        .readFileSync(envPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf('=');
          if (idx === -1) return null;
          return [line.slice(0, idx), line.slice(idx + 1)] as const;
        })
        .filter((entry): entry is readonly [string, string] => !!entry);
      for (const [key, value] of envEntries) {
        process.env[key] = value;
      }
    }
    const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as E2EContext;
    await use(ctx);
  },
  signIn: async ({ page, e2eContext }, use) => {
    const signInFn = async (email: string, password: string) => {
      await page.goto('/auth/login');
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.getByRole('button', { name: /log in/i });
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await submitButton.click();
      await page.waitForURL(
        (url) => url.pathname.startsWith('/app') || url.pathname === '/enter-code',
        { timeout: 15000 }
      );

      if (new URL(page.url()).pathname === '/enter-code') {
        await page.locator('input[name="code"]').fill(e2eContext.classCode);
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForURL('**/app**', { timeout: 15000 });
      }
    };
    await use(signInFn);
  },
});

export { expect } from '@playwright/test';
