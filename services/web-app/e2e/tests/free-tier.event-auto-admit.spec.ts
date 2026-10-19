/**
 * QA repro for demo free-tier event auto-admit links.
 *
 * Local faithful demo stand-in:
 *   FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-suite-post-closure-mainline-health \
 *   PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
 *   bunx playwright test --config=playwright.free-tier-event-auto.config.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';

const OUT =
  process.env.FREE_TIER_QA_SHOTS_DIR?.trim() ||
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-suite-post-closure-mainline-health';
const LOCAL_BASE_URL = `http://127.0.0.1:${process.env.FREE_TIER_E2E_PORT || 5197}`;

function localUrl(path: string) {
  return new URL(path, LOCAL_BASE_URL).toString();
}

async function shot(page: Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

async function note(name: string, body: string) {
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, name), body);
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

test.describe('Free-tier event auto-admit QA', () => {
  test('local demo stand-in: event link scan, auto-admit signup, cookie, and sign-in', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const prisma = createE2EPrismaClient();
    const run = Date.now().toString(36);
    const label = `qa-event-auto-${run}`;
    const email = `qa-event-auto-${run}@example.com`;
    const teacherName = `QA Event Auto ${run}`;
    const password = `Qa-event-auto-${run}-pass1!`;
    let tokenId: string | null = null;
    let applicationId: string | null = null;
    let userId: string | null = null;

    try {
      const code = randomBytes(6).toString('base64url');
      const token = await prisma.acquisitionToken.create({
        data: {
          code,
          tokenHash: hashToken(code),
          label,
          bypassWaitlist: true,
          maxUses: 5,
          createdBy: 'free-tier-qa',
          sourceName: 'QA event auto-admit',
          eventLocation: 'Demo QA',
          eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          notes: 'Created by qa-event-auto Playwright repro.',
        },
        select: { id: true },
      });
      tokenId = token.id;

      const freeResponse = await fetch(localUrl(`/free?t=${encodeURIComponent(code)}`), {
        redirect: 'manual',
      });
      expect(freeResponse.status).toBe(200);
      expect(freeResponse.url).toContain('/free?t=');

      await page.goto(`/free?t=${encodeURIComponent(code)}`);
      await expect(page).toHaveURL(new RegExp(`/free\\?t=${code}`));
      await expect(page.getByText('Use your event link to continue.')).toBeVisible();
      await shot(page, '01-event-link-landing.png');

      const scanCookie = (await page.context().cookies()).find(
        (cookie) => cookie.name === '__yawp_ft_scan'
      );
      expect(scanCookie?.value).toBeTruthy();

      const scanned = await prisma.acquisitionToken.findUniqueOrThrow({
        where: { id: token.id },
        select: { scanCount: true },
      });
      expect(scanned.scanCount).toBeGreaterThanOrEqual(1);

      await page.getByLabel('Your name').fill(teacherName);
      await page.getByLabel('School email').fill(email);
      await page.getByLabel('School name').fill(`QA Demo ${run}`);
      await page.getByLabel('Location').fill('Demo QA');
      await page.getByLabel('Grade level').fill('9');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Check your email')).toBeVisible({
        timeout: 15_000,
      });
      await shot(page, '02-event-auto-admit-redeemed.png');

      const app = await prisma.freeTierApplication.findUniqueOrThrow({
        where: { email },
        select: { id: true, status: true, acquisitionTokenId: true },
      });
      applicationId = app.id;
      expect(app.status).toBe('INVITED');
      expect(app.acquisitionTokenId).toBe(token.id);

      const afterRedeem = await prisma.acquisitionToken.findUniqueOrThrow({
        where: { id: token.id },
        select: { uses: true },
      });
      expect(afterRedeem.uses).toBe(1);

      const release = await mintFreeTierLinkForE2E(prisma, {
        applicationId: app.id,
        purpose: 'RELEASE',
      });

      await page.goto(`/free/join?t=${encodeURIComponent(release.token)}`);
      await expect(page.getByRole('heading', { name: /^(Welcome to YAWP!|Create your free classroom)$/ })).toBeVisible();
      await shot(page, '03-release-join-account-form.png');

      await page.getByLabel('Your name').fill(teacherName);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/app\/free-tier\/onboarding/, {
        timeout: 15_000,
      });
      await shot(page, '04-account-created-onboarding.png');

      const account = await prisma.freeTierApplication.findUniqueOrThrow({
        where: { email },
        select: { status: true, userId: true },
      });
      userId = account.userId;
      expect(account.status).toBe('ACCOUNT_CREATED');
      expect(userId).toBeTruthy();

      await page.context().clearCookies();
      await page.goto('/auth/login');
      await page.getByLabel('Email or handle').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
      await shot(page, '05-account-sign-in-success.png');
    } finally {
      if (userId) {
        await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
      }
      if (applicationId) {
        await prisma.freeTierSignedLink
          .deleteMany({ where: { applicationId } })
          .catch(() => {});
        await prisma.freeTierEmailLog
          .deleteMany({ where: { applicationId } })
          .catch(() => {});
        await prisma.freeTierApplication
          .delete({ where: { id: applicationId } })
          .catch(() => {});
      }
      await prisma.user.delete({ where: { email } }).catch(() => {});
      if (tokenId) {
        await prisma.acquisitionTokenScan
          .deleteMany({ where: { tokenId } })
          .catch(() => {});
        await prisma.acquisitionToken.delete({ where: { id: tokenId } }).catch(() => {});
      }
    }
  });

  test('hosted demo run documents missing access cleanly', async () => {
    const required = [
      'DEMO_FREE_TIER_EVENT_TOKEN',
      'DEMO_FREE_TIER_BASE_URL',
      'DEMO_FREE_TIER_JOIN_TOKEN',
    ];
    const missing = required.filter((key) => !process.env[key]?.trim());
    if (missing.length) {
      await note(
        'hosted-demo-event-auto-skip.txt',
        [
          'Hosted demo qa-event-auto run skipped.',
          `Missing env/access: ${missing.join(', ')}`,
          '',
          'Local faithful demo stand-in covers /free?t= landing, scan cookie, auto-admit redemption, release join, and sign-in.',
        ].join('\n')
      );
      test.skip(true, `Hosted demo access missing: ${missing.join(', ')}`);
    }
    await note(
      'hosted-demo-event-auto-skip.txt',
      [
        'Hosted demo qa-event-auto run skipped.',
        'Required hosted tokens were present, but this QA suite avoids mutating hosted demo until a disposable event/application fixture contract and explicit mutation opt-in are present.',
      ].join('\n')
    );
    test.skip(
      true,
      'Hosted demo auto-admit assertions are documented as unavailable until disposable hosted fixtures exist.'
    );
  });
});
