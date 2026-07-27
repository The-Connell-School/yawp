/**
 * Signing a demo user in.
 *
 * Demos run against a seeded local database, never production. That is a hard
 * rule rather than a convenience: these videos get posted in Slack and
 * attached to PRs, and this is a product used by real students, so no frame of
 * a demo should ever contain a real student's name or work.
 */

import type { Page } from '@playwright/test';

export type DemoRole = 'student' | 'teacher' | 'admin';

export type Credentials = { email: string; password: string };

/**
 * The preset local-dev logins from AGENTS.md.
 *
 * Override per role with DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, and so on,
 * plus DEMO_PASSWORD — useful when recording against an e2e-seeded database,
 * whose fixture users differ.
 */
export function demoCredentials(
  role: DemoRole,
  env: Record<string, string | undefined> = process.env
): Credentials {
  const key = role.toUpperCase();
  return {
    email: env[`DEMO_${key}_EMAIL`] ?? `dev.${role}@yawp.local`,
    password: env[`DEMO_${key}_PASSWORD`] ?? env.DEMO_PASSWORD ?? 'yawp-dev',
  };
}

/**
 * Sign in through the real login form.
 *
 * Called from a demo's `setup`, so it runs behind the title card and never
 * shows up in the finished video.
 */
export async function signIn(page: Page, role: DemoRole): Promise<void> {
  const { email, password } = demoCredentials(role);

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();

  await page
    .waitForURL(
      (url) => url.pathname.startsWith('/app') || url.pathname === '/enter-code',
      { timeout: 15_000 }
    )
    .catch(() => {
      throw new Error(
        `Could not sign in as ${email}.\n` +
          'Is the dev server running against a seeded database? Try:\n' +
          '  bun dev            (from the repo root)\n' +
          '  bun db:seed-local-dev'
      );
    });

  if (new URL(page.url()).pathname === '/enter-code') {
    throw new Error(
      `${email} is not enrolled in a class, so sign-in stopped at /enter-code.\n` +
        'Re-seed with `bun db:seed-local-dev`, or point at a different account ' +
        'with DEMO_STUDENT_EMAIL.'
    );
  }
}
