/**
 * QA guardrails for demo free-tier caps, cookies, and abuse paths.
 *
 * Local faithful demo stand-in:
 *   FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-suite-post-closure-mainline-health \
 *   PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
 *   bunx playwright test --config=playwright.free-tier-caps-limits.config.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../test-setup';
import { setFreeTierFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const OUT =
  process.env.FREE_TIER_QA_SHOTS_DIR?.trim() ||
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-suite-post-closure-mainline-health';
const SCAN_COOKIE = '__yawp_ft_scan';
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

function makeCode() {
  return randomBytes(6).toString('base64url');
}

async function createToken(input: {
  label: string;
  maxUses?: number;
  uses?: number;
  bypassWaitlist?: boolean;
}) {
  const prisma = createE2EPrismaClient();
  const code = makeCode();
  const token = await prisma.acquisitionToken.create({
    data: {
      code,
      tokenHash: hashToken(code),
      label: input.label,
      maxUses: input.maxUses ?? null,
      uses: input.uses ?? 0,
      bypassWaitlist: input.bypassWaitlist ?? false,
      createdBy: 'free-tier-qa',
      sourceName: 'QA caps limits',
      eventLocation: 'Demo QA',
      eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: 'Created by qa-caps-limits Playwright repro.',
    },
    select: { id: true },
  });
  await prisma.$disconnect();
  return { id: token.id, code };
}

async function cleanupByRun(run: string, tokenIds: string[]) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.freeTierEmailLog
      .deleteMany({ where: { application: { email: { contains: run } } } })
      .catch(() => {});
    await prisma.freeTierSignedLink
      .deleteMany({ where: { application: { email: { contains: run } } } })
      .catch(() => {});
    await prisma.freeTierApplication
      .deleteMany({ where: { email: { contains: run } } })
      .catch(() => {});
    await prisma.user
      .deleteMany({ where: { email: { contains: run } } })
      .catch(() => {});
    if (tokenIds.length) {
      await prisma.acquisitionTokenScan
        .deleteMany({ where: { tokenId: { in: tokenIds } } })
        .catch(() => {});
      await prisma.acquisitionToken
        .deleteMany({ where: { id: { in: tokenIds } } })
        .catch(() => {});
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function bodyExcerpt(responseText: string) {
  return responseText.replace(/\s+/g, ' ').slice(0, 800);
}

function expectNoServerErrorMarkers(text: string) {
  expect(text).not.toMatch(
    /Internal Server Error|stack trace|PrismaClientKnownRequestError/i
  );
}

test.describe.serial('Free-tier caps, limits, and cookie QA', () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
    await setFreeTierFlag(true);
  });

  test('local demo stand-in: exhausted event link is friendly and has no side effects', async ({
    page,
  }) => {
    const run = `qa-caps-${Date.now().toString(36)}`;
    const email = `${run}@example.com`;
    const tokenIds: string[] = [];

    try {
      const token = await createToken({
        label: `${run}-exhausted`,
        maxUses: 1,
        uses: 1,
        bypassWaitlist: true,
      });
      tokenIds.push(token.id);

      const response = await fetch(
        localUrl(`/free?t=${encodeURIComponent(token.code)}`)
      );
      const text = await response.text();
      expect(response.status).toBe(200);
      expectNoServerErrorMarkers(text);

      await page.goto(`/free?t=${encodeURIComponent(token.code)}`);
      await expect(page.getByRole('status')).toContainText(
        /event link is closed/i
      );
      await expect(
        page.getByText(/expired, reached its limit, or been disabled/i)
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(
        0
      );
      await shot(page, '01-exhausted-cap-friendly-rejection.png');
      await note(
        '01-exhausted-cap-response.txt',
        [
          'Exhausted event-link response.',
          `status: ${response.status}`,
          `tokenId: ${token.id}`,
          `bodyExcerpt: ${await bodyExcerpt(text)}`,
        ].join('\n')
      );

      const submitted = await fetch(localUrl('/free?index'), {
        method: 'POST',
        body: new URLSearchParams({
          intent: 'redeem',
          token: token.code,
          name: 'QA Exhausted Cap',
          email,
          schoolName: 'QA Demo',
          location: 'Demo QA',
          gradeLevel: '9',
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      const submittedText = await submitted.text();
      expect(submitted.status).toBe(200);
      expectNoServerErrorMarkers(submittedText);
      expect(submittedText).toContain('exhausted');

      const prisma = createE2EPrismaClient();
      try {
        const application = await prisma.freeTierApplication.findUnique({
          where: { email },
          select: {
            id: true,
            status: true,
            userId: true,
            acquisitionTokenId: true,
          },
        });
        expect(application).toBeNull();

        const tokenAfterSubmit = await prisma.acquisitionToken.findUniqueOrThrow({
          where: { id: token.id },
          select: { uses: true, maxUses: true },
        });
        expect(tokenAfterSubmit).toMatchObject({ uses: 1, maxUses: 1 });

        await expect(
          prisma.freeTierApplication.count({
            where: { acquisitionTokenId: token.id, email },
          })
        ).resolves.toBe(0);
        await expect(
          prisma.user.count({
            where: { email },
          })
        ).resolves.toBe(0);
        await expect(
          prisma.freeTierSignedLink.count({
            where: { application: { email } },
          })
        ).resolves.toBe(0);
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      await cleanupByRun(run, tokenIds);
    }
  });

  test('local demo stand-in: missing, cleared, and invalid scan cookies recover without 500s', async ({
    page,
  }) => {
    const run = `qa-cookie-${Date.now().toString(36)}`;
    const tokenIds: string[] = [];

    try {
      const token = await createToken({ label: `${run}-scan`, maxUses: 5 });
      tokenIds.push(token.id);
      const url = `/free?t=${encodeURIComponent(token.code)}`;

      const first = await page.goto(url);
      expect(first?.status()).toBe(200);
      await expect(
        page.getByText('Sign up below to start your free Yawp! classroom.')
      ).toBeVisible();
      await shot(page, '02-missing-cookie-recovery.png');

      const cookies = await page.context().cookies();
      const minted = cookies.find((cookie) => cookie.name === SCAN_COOKIE);
      expect(minted?.value).toBeTruthy();

      const second = await fetch(localUrl(url), {
        headers: { cookie: `${SCAN_COOKIE}=${minted!.value}` },
      });
      expect(second.status).toBe(200);

      const prisma = createE2EPrismaClient();
      try {
        const afterDedupe = await prisma.acquisitionToken.findUniqueOrThrow({
          where: { id: token.id },
          select: { scanCount: true },
        });
        expect(afterDedupe.scanCount).toBe(1);
      } finally {
        await prisma.$disconnect();
      }

      await page.context().clearCookies();
      const cleared = await page.goto(url);
      expect(cleared?.status()).toBe(200);
      await expect(
        page.getByText('Sign up below to start your free Yawp! classroom.')
      ).toBeVisible();
      await shot(page, '03-cleared-cookie-recovery.png');

      const origin = new URL(page.url()).origin;
      await page.context().clearCookies();
      await page.context().addCookies([
        {
          name: SCAN_COOKIE,
          value: 'bad',
          url: origin,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      const invalid = await page.goto(url);
      expect(invalid?.status()).toBe(200);
      await expect(
        page.getByText('Sign up below to start your free Yawp! classroom.')
      ).toBeVisible();
      await shot(page, '04-invalid-cookie-recovery.png');

      const invalidText = await (
        await fetch(localUrl(url), { headers: { cookie: `${SCAN_COOKIE}=bad` } })
      ).text();
      expectNoServerErrorMarkers(invalidText);

      const finalPrisma = createE2EPrismaClient();
      try {
        const scanned = await finalPrisma.acquisitionToken.findUniqueOrThrow({
          where: { id: token.id },
          select: { scanCount: true },
        });
        expect(scanned.scanCount).toBeGreaterThanOrEqual(3);
        await note(
          '02-cookie-recovery-evidence.txt',
          [
            'Missing, cleared, and invalid scan-cookie recovery.',
            `tokenId: ${token.id}`,
            `finalScanCount: ${scanned.scanCount}`,
            'same valid cookie request was deduped inside the scan window',
            'all browser-visible responses stayed HTTP 200 with no stack trace markers',
          ].join('\n')
        );
      } finally {
        await finalPrisma.$disconnect();
      }
    } finally {
      await cleanupByRun(run, tokenIds);
    }
  });

  test('local demo stand-in: duplicate submissions are safe and excessive attempts are friendly', async ({
    page,
  }) => {
    const run = `qa-abuse-${Date.now().toString(36)}`;
    const email = `${run}@example.com`;

    try {
      for (let i = 0; i < 6; i++) {
        const response = await fetch(localUrl('/free?index'), {
          method: 'POST',
          body: new URLSearchParams({
            intent: 'waitlist',
            name: `QA Abuse ${i}`,
            email,
            schoolName: 'QA Demo',
            location: 'Demo QA',
            gradeLevel: '9',
          }),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        });
        const text = await response.text();
        expect(response.status).toBe(200);
        expectNoServerErrorMarkers(text);
      }

      const prisma = createE2EPrismaClient();
      try {
        const rows = await prisma.freeTierApplication.findMany({
          where: { email },
          select: { id: true, status: true, userId: true },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: 'LEAD', userId: null });
      } finally {
        await prisma.$disconnect();
      }

      await page.goto('/free');
      await page.getByLabel('Your name').fill('QA Abuse Visible');
      await page.getByLabel('School email').fill(email);
      await page.getByLabel('School name').fill('QA Demo');
      await page.getByLabel('Location').fill('Demo QA');
      await page.getByLabel('Grade level').fill('9');
      await page.getByRole('button', { name: 'Join the waitlist' }).click();
      await expect(
        page.getByText(/Too many attempts\. Please wait and try again\./)
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('body')).not.toContainText(
        /stack trace|PrismaClientKnownRequestError/i
      );
      await shot(page, '05-rate-limit-friendly-rejection.png');
      await note(
        '03-abuse-rate-limit-evidence.txt',
        [
          'Duplicate-safe and rate-limit evidence.',
          `email: ${email}`,
          'six duplicate waitlist POSTs returned HTTP 200 and created one LEAD row',
          'seventh browser submission showed friendly rate-limit copy with no stack trace marker',
        ].join('\n')
      );
    } finally {
      await cleanupByRun(run, []);
    }
  });

  test('hosted demo run skips without disposable fixture env', async () => {
    const required = [
      'DEMO_FREE_TIER_BASE_URL',
      'DEMO_FREE_TIER_CAPS_EVENT_TOKEN',
      'DEMO_FREE_TIER_COOKIE_EVENT_TOKEN',
      'DEMO_FREE_TIER_ABUSE_EMAIL',
      'DEMO_FREE_TIER_DISPOSABLE_OK',
    ];
    const missing = required.filter((key) => !process.env[key]?.trim());
    if (missing.length || process.env.DEMO_FREE_TIER_DISPOSABLE_OK !== '1') {
      await note(
        'hosted-demo-caps-limits-skip.txt',
        [
          'Hosted demo qa-caps-limits run skipped.',
          `Missing env/access: ${missing.join(', ') || 'none'}`,
          'DEMO_FREE_TIER_DISPOSABLE_OK must be 1 before this suite mutates hosted demo data.',
          '',
          'Local faithful demo stand-in covers exhausted cap rejection, scan-cookie recovery, duplicate-safe submissions, and friendly rate-limit copy.',
        ].join('\n')
      );
      test.skip(
        true,
        `Hosted demo disposable fixtures unavailable: ${missing.join(', ')}`
      );
    }

    await note(
      'hosted-demo-caps-limits-skip.txt',
      [
        'Hosted demo qa-caps-limits run skipped.',
        'Disposable fixture env was present, but hosted mutations are intentionally not implemented until a fixture contract provides resettable event tokens and application cleanup.',
      ].join('\n')
    );
    test.skip(
      true,
      'Hosted demo fixture contract is documented but not implemented.'
    );
  });
});
