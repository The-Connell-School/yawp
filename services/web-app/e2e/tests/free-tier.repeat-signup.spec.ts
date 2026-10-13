/**
 * QA repro for repeat sign-ups on demo free-tier event links.
 *
 * Local faithful demo stand-in:
 *   QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-repeat-signup \
 *   PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
 *   bunx playwright test --config=playwright.free-tier-repeat-signup.config.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient, type E2EPrismaClient } from '../prisma-client';
import { setFreeTierFlag } from '../feature-flags';

const OUT =
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-repeat-signup';

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

async function submitEventSignup(page: Page, input: {
  code: string;
  name: string;
  email: string;
  schoolName: string;
  location: string;
  gradeLevel: string;
}) {
  await page.goto(`/free?t=${encodeURIComponent(input.code)}`);
  await expect(page).toHaveURL(new RegExp(`/free\\?t=${input.code}`));
  await expect(page.getByText('Use your event link to continue.')).toBeVisible();
  await page.getByLabel('Your name').fill(input.name);
  await page.getByLabel('School email').fill(input.email);
  await page.getByLabel('School name').fill(input.schoolName);
  await page.getByLabel('Location').fill(input.location);
  await page.getByLabel('Grade level').fill(input.gradeLevel);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('status')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('body')).not.toContainText(
    /stack trace|traceback|internal server error/i
  );
}

async function repeatState(prisma: E2EPrismaClient, tokenId: string, email: string) {
  const [applications, users, token] = await Promise.all([
    prisma.freeTierApplication.findMany({
      where: { email },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        acquisitionTokenId: true,
        releasedAt: true,
        userId: true,
        name: true,
      },
    }),
    prisma.user.findMany({
      where: { email },
      select: { id: true, email: true },
    }),
    prisma.acquisitionToken.findUniqueOrThrow({
      where: { id: tokenId },
      select: { uses: true, scanCount: true },
    }),
  ]);
  return { applications, users, token };
}

async function expectSingleInvitedApplication(
  prisma: E2EPrismaClient,
  tokenId: string,
  email: string,
  expectedUses: number
) {
  const state = await repeatState(prisma, tokenId, email);
  expect(state.applications).toHaveLength(1);
  expect(state.applications[0]).toMatchObject({
    status: 'INVITED',
    acquisitionTokenId: tokenId,
    userId: null,
  });
  expect(state.applications[0].releasedAt).toBeTruthy();
  expect(state.users).toHaveLength(0);
  expect(state.token.uses).toBe(expectedUses);
  return state;
}

test.describe('Free-tier repeat sign-up QA', () => {
  test.beforeAll(async () => {
    await setFreeTierFlag(true);
  });

  test('local demo stand-in: repeated event sign-ups do not create duplicate enrollment', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(120_000);

    const prisma = createE2EPrismaClient();
    const run = Date.now().toString(36);
    const code = randomBytes(6).toString('base64url');
    const label = `qa-repeat-signup-${run}`;
    const email = `qa-repeat-signup-${run}@example.com`;
    const baseInput = {
      code,
      name: `QA Repeat Signup ${run}`,
      email,
      schoolName: `QA Demo ${run}`,
      location: 'Demo QA',
      gradeLevel: '9',
    };
    let tokenId: string | null = null;
    let applicationId: string | null = null;

    try {
      const token = await prisma.acquisitionToken.create({
        data: {
          code,
          tokenHash: hashToken(code),
          label,
          bypassWaitlist: true,
          maxUses: 5,
          createdBy: 'free-tier-qa',
          sourceName: 'QA repeat signup',
          eventLocation: 'Demo QA',
          eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          notes: 'Created by qa-repeat-signup Playwright repro.',
        },
        select: { id: true },
      });
      tokenId = token.id;

      const freeResponse = await request.get(`/free?t=${encodeURIComponent(code)}`, {
        maxRedirects: 0,
      });
      expect(freeResponse.status()).toBe(200);

      await page.goto(`/free?t=${encodeURIComponent(code)}`);
      await expect(page.getByText('Use your event link to continue.')).toBeVisible();
      await shot(page, '01-repeat-signup-form-before-submit.png');

      await submitEventSignup(page, baseInput);
      await expect(page.getByText('Check your email for your join link.')).toBeVisible();
      await shot(page, '02-repeat-signup-first-success.png');

      const firstState = await expectSingleInvitedApplication(prisma, token.id, email, 1);
      applicationId = firstState.applications[0].id;

      await submitEventSignup(page, {
        ...baseInput,
        name: `${baseInput.name} Same Browser`,
      });
      await expect(page.getByText('Check your email for your join link.')).toBeVisible();
      await shot(page, '03-repeat-signup-same-browser.png');
      const sameBrowserState = await expectSingleInvitedApplication(
        prisma,
        token.id,
        email,
        1
      );

      const clearedContext = await browser.newContext();
      try {
        const clearedPage = await clearedContext.newPage();
        await submitEventSignup(clearedPage, {
          ...baseInput,
          name: `${baseInput.name} Cleared Cookie`,
        });
        await expect(clearedPage.getByText('Check your email for your join link.')).toBeVisible();
        await shot(clearedPage, '04-repeat-signup-cleared-cookie.png');
      } finally {
        await clearedContext.close();
      }
      const clearedCookieState = await expectSingleInvitedApplication(
        prisma,
        token.id,
        email,
        1
      );

      const freshContext = await browser.newContext();
      try {
        const freshPage = await freshContext.newPage();
        await submitEventSignup(freshPage, {
          ...baseInput,
          name: `${baseInput.name} Uppercase Email`,
          email: email.toUpperCase(),
        });
        await expect(freshPage.getByText('Check your email for your join link.')).toBeVisible();
      } finally {
        await freshContext.close();
      }
      const uppercaseState = await expectSingleInvitedApplication(prisma, token.id, email, 1);

      await note(
        '05-repeat-signup-db-evidence.txt',
        [
          'Local demo repeat sign-up evidence.',
          `label: ${label}`,
          `tokenId: ${token.id}`,
          `email: ${email}`,
          `applicationId: ${applicationId}`,
          `first submit applications: ${firstState.applications.length}`,
          `same-browser repeat applications: ${sameBrowserState.applications.length}`,
          `cleared-cookie repeat applications: ${clearedCookieState.applications.length}`,
          `uppercase fresh-context repeat applications: ${uppercaseState.applications.length}`,
          `token uses after all repeats: ${uppercaseState.token.uses}`,
          `user accounts created by /free?t= repeats: ${uppercaseState.users.length}`,
        ].join('\n')
      );
    } finally {
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
    const required = ['DEMO_FREE_TIER_BASE_URL', 'DEMO_FREE_TIER_REPEAT_EVENT_TOKEN'];
    const missing = required.filter((key) => !process.env[key]?.trim());
    if (missing.length) {
      await note(
        'hosted-demo-skip.txt',
        [
          'Hosted demo qa-repeat-signup run skipped.',
          `Missing env/access: ${missing.join(', ')}`,
          '',
          'Local faithful demo stand-in covers /free?t= first submission, same-browser repeat submission, cleared-cookie repeat submission, and same-email reuse from a fresh context.',
        ].join('\n')
      );
      test.skip(true, `Hosted demo access missing: ${missing.join(', ')}`);
    }
    await note(
      'hosted-demo-skip.txt',
      [
        'Hosted demo qa-repeat-signup run skipped.',
        'Hosted demo repeat-submission assertions are not implemented in this PR.',
        'Required hosted token env was present, but this QA suite avoids mutating hosted demo until the runner has a dedicated disposable repeat-signup fixture contract.',
      ].join('\n')
    );
    test.skip(
      true,
      'Hosted demo assertions are documented as unavailable until disposable hosted fixtures exist.'
    );
  });
});
