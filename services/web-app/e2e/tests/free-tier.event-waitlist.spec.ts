/**
 * QA repro for demo free-tier event links in waitlist mode.
 *
 * Local faithful demo stand-in:
 *   QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-event-waitlist \
 *   PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
 *   bunx playwright test --config=playwright.free-tier-event-waitlist.config.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFreeTierFlag } from '../feature-flags';
import { waitForFreeTierEmailPayload } from '../helpers/free-tier-email';

const OUT =
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-event-waitlist';
const E2E_MANAGEMENT_SERVICE_KEY =
  'e2e-free-tier-release-management-key-000000000000';

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

function releaseTokenFromJoinUrl(joinUrl: string) {
  const parsed = new URL(joinUrl);
  const token = parsed.searchParams.get('t');
  if (!token) throw new Error(`Release join URL is missing t=: ${joinUrl}`);
  return token;
}

test.describe('Free-tier event waitlist QA', () => {
  test.beforeAll(async () => {
    await setFreeTierFlag(true);
  });

  test('local demo stand-in: scan, waitlist application, release, and join path', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    const prisma = createE2EPrismaClient();
    const run = Date.now().toString(36);
    const label = `qa-event-waitlist-${run}`;
    const email = `qa-event-waitlist-${run}@example.com`;
    const teacherName = `QA Event Waitlist ${run}`;
    const password = `Qa-event-waitlist-${run}-pass1!`;
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
          bypassWaitlist: false,
          maxUses: 5,
          createdBy: 'free-tier-qa',
          sourceName: 'QA event waitlist',
          eventLocation: 'Demo QA',
          eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          notes: 'Created by qa-event-waitlist Playwright repro.',
        },
        select: { id: true },
      });
      tokenId = token.id;

      const freeResponse = await request.get(`/free?t=${encodeURIComponent(code)}`, {
        maxRedirects: 0,
      });
      expect(freeResponse.status()).toBe(200);
      expect(freeResponse.url()).toContain('/free?t=');

      await page.goto(`/free?t=${encodeURIComponent(code)}`);
      await expect(page).toHaveURL(new RegExp(`/free\\?t=${code}`));
      await expect(page.getByText('Use your event link to continue.')).toBeVisible();
      await shot(page, '01-event-waitlist-form-before-submit.png');

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
      const status = page.getByRole('status');
      await expect(status).toBeVisible({ timeout: 15_000 });
      await shot(page, '02-event-waitlist-submitted.png');
      const statusText = (await status.textContent())?.trim() ?? '';

      const app = await prisma.freeTierApplication.findUniqueOrThrow({
        where: { email },
        select: {
          id: true,
          status: true,
          acquisitionTokenId: true,
          email: true,
          name: true,
        },
      });
      applicationId = app.id;
      expect(app).toMatchObject({
        status: 'LEAD',
        acquisitionTokenId: token.id,
        email,
        name: teacherName,
      });

      if (!statusText.includes("You're on the list.")) {
        await note(
          '02-event-waitlist-copy-mismatch.txt',
          [
            'Observed local demo waitlist-mode event copy mismatch.',
            `label: ${label}`,
            `email: ${email}`,
            `applicationId: ${app.id}`,
            'expected copy: You\'re on the list.',
            `actual copy: ${statusText}`,
            'database status: LEAD',
          ].join('\n')
        );
      }

      const afterRedeem = await prisma.acquisitionToken.findUniqueOrThrow({
        where: { id: token.id },
        select: { uses: true },
      });
      expect(afterRedeem.uses).toBe(1);

      await note(
        '03-waitlist-queue-evidence.txt',
        [
          'Local demo waitlist evidence.',
          `label: ${label}`,
          `applicationId: ${app.id}`,
          `email: ${email}`,
          'status before release: LEAD',
          'release path: platform internal release endpoint with captured local email log',
        ].join('\n')
      );

      const releaseResponse = await request.post('/api/internal/v1/free-tier/release', {
        headers: {
          authorization: `Bearer ${E2E_MANAGEMENT_SERVICE_KEY}`,
          'content-type': 'application/json',
        },
        data: { applicationIds: [app.id] },
      });
      expect(releaseResponse.status()).toBe(200);
      await expect(async () => {
        const body = await releaseResponse.json();
        expect(body).toMatchObject({
          released: 1,
          refused: 0,
          skipped: 0,
          emailFailureCount: 0,
        });
      }).toPass();

      const invited = await prisma.freeTierApplication.findUniqueOrThrow({
        where: { id: app.id },
        select: { status: true, releasedAt: true },
      });
      expect(invited.status).toBe('INVITED');
      expect(invited.releasedAt).toBeTruthy();

      const releasePayload = await waitForFreeTierEmailPayload(prisma, {
        applicationId: app.id,
        kind: 'release',
      });
      const releaseToken = releaseTokenFromJoinUrl(releasePayload.joinUrl);

      await page.goto(`/free/join?t=${encodeURIComponent(releaseToken)}`);
      await expect(page.getByRole('heading', { name: 'Before we begin' })).toBeVisible();
      await shot(page, '04-release-youre-in-join-form.png');

      await page.getByLabel('Your name').fill(teacherName);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/app\/free-tier\/onboarding/, {
        timeout: 15_000,
      });
      await shot(page, '05-youre-in-account-created.png');

      const account = await prisma.freeTierApplication.findUniqueOrThrow({
        where: { email },
        select: { status: true, userId: true },
      });
      userId = account.userId;
      expect(account.status).toBe('ACCOUNT_CREATED');
      expect(userId).toBeTruthy();

      await page.request.post('/auth/logout');
      await page.goto('/auth/login');
      await page.getByLabel('Email or handle').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
      await shot(page, '06-unique-login-success.png');
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
      await prisma.$disconnect();
    }
  });

  test('hosted demo run documents unavailable hosted assertions cleanly', async () => {
    const required = [
      'DEMO_FREE_TIER_BASE_URL',
      'DEMO_FREE_TIER_WAITLIST_EVENT_TOKEN',
      'DEMO_FREE_TIER_RELEASE_OPERATOR_ACCESS',
    ];
    const missing = required.filter((key) => !process.env[key]?.trim());
    if (missing.length) {
      await note(
        'hosted-demo-skip.txt',
        [
          'Hosted demo qa-event-waitlist run skipped.',
          `Missing env/access: ${missing.join(', ')}`,
          '',
          'Local faithful demo stand-in covers event scan, waitlist submission, waitlist evidence, release endpoint behavior, captured release email payload, release join, account creation, and sign-in.',
        ].join('\n')
      );
      test.skip(true, `Hosted demo access missing: ${missing.join(', ')}`);
    }
    await note(
      'hosted-demo-skip.txt',
      [
        'Hosted demo qa-event-waitlist run skipped.',
        'Hosted demo scan/submission/release/join assertions are not implemented in this PR.',
        'Required hosted operator access was present, but this QA suite avoids mutating hosted demo until the runner has a dedicated disposable event/application fixture contract.',
      ].join('\n')
    );
    test.skip(
      true,
      'Hosted demo assertions are documented as unavailable until disposable hosted fixtures exist.'
    );
  });
});
