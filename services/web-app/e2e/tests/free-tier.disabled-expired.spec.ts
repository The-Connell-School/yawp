/**
 * QA repro for demo free-tier event links that should reject sign-ups.
 *
 * Local faithful demo stand-in:
 *   QA_SCREENSHOT_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-disabled-expired \
 *   PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
 *   bunx playwright test --config=playwright.free-tier-disabled-expired.config.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFreeTierFlag } from '../feature-flags';

const OUT =
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-disabled-expired';
const LOCAL_BASE_URL = `http://127.0.0.1:${process.env.FREE_TIER_E2E_PORT || 5197}`;

function localUrl(path: string) {
  return new URL(path, LOCAL_BASE_URL).toString();
}

type TokenCase = {
  key: 'disabled' | 'expired' | 'disabledAt';
  label: string;
  data: {
    maxUses?: number;
    uses?: number;
    expiresAt?: Date;
    disabledAt?: Date;
  };
};

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

const cases: TokenCase[] = [
  {
    key: 'disabled',
    label: 'disabled by exhausted maxUses',
    data: { maxUses: 1, uses: 1 },
  },
  {
    key: 'expired',
    label: 'expired by time',
    data: { maxUses: 5, expiresAt: new Date(Date.now() - 60 * 1000) },
  },
  {
    key: 'disabledAt',
    label: 'disabledAt set',
    data: { maxUses: 5, disabledAt: new Date(Date.now() - 60 * 1000) },
  },
];

test.describe('Free-tier rejected event link QA', () => {
  test.beforeAll(async () => {
    await setFreeTierFlag(true);
  });

  test('local demo stand-in: closed event links reject sign-ups and de-dupe scans', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const prisma = createE2EPrismaClient();
    const run = Date.now().toString(36);
    const tokenIds: string[] = [];
    const evidence: string[] = [
      'Local demo rejected event-link scan evidence.',
      'Expected behavior: first visit to a rejected known token increments scanCount; same-browser repeat within 10 minutes does not.',
      '',
    ];

    try {
      for (const item of cases) {
        const code = randomBytes(6).toString('base64url');
        const email = `qa-${item.key}-${run}@example.com`;
        const token = await prisma.acquisitionToken.create({
          data: {
            code,
            tokenHash: hashToken(code),
            label: `qa-disabled-expired-${item.key}-${run}`,
            bypassWaitlist: true,
            maxUses: item.data.maxUses ?? 5,
            uses: item.data.uses ?? 0,
            expiresAt: item.data.expiresAt ?? null,
            disabledAt: item.data.disabledAt ?? null,
            createdBy: 'free-tier-qa',
            sourceName: `QA ${item.label}`,
            eventLocation: 'Demo QA',
            eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            notes: 'Created by qa-disabled-expired Playwright repro.',
          },
          select: { id: true },
        });
        tokenIds.push(token.id);

        const firstResponse = await page.goto(
          `/free?t=${encodeURIComponent(code)}`
        );
        expect(firstResponse?.status()).toBe(200);
        await expect(page.getByRole('status')).toContainText(
          'This event link is closed.'
        );
        await expect(page.getByRole('status')).toContainText(
          'The link may have expired, reached its limit, or been disabled.'
        );
        await expect(
          page.getByRole('link', { name: 'Join the waitlist' })
        ).toBeVisible();
        await expect(page.locator('body')).not.toContainText(
          /stack trace|traceback|internal server error/i
        );
        await shot(page, `01-${item.key}-closed-link.png`);

        const scanCookie = (await page.context().cookies()).find(
          (cookie) => cookie.name === '__yawp_ft_scan'
        );
        expect(scanCookie?.value).toBeTruthy();

        const afterFirstScan = await prisma.acquisitionToken.findUniqueOrThrow({
          where: { id: token.id },
          select: { scanCount: true, uses: true },
        });
        const scanRowsAfterFirst = await prisma.acquisitionTokenScan.count({
          where: { tokenId: token.id },
        });
        expect(afterFirstScan.scanCount).toBe(1);
        expect(scanRowsAfterFirst).toBe(1);

        const rejectResponse = await fetch(localUrl('/free?index'), {
          method: 'POST',
          body: new URLSearchParams({
            intent: 'redeem',
            token: code,
            name: `QA ${item.key}`,
            email,
            schoolName: 'QA Demo',
            location: 'Demo QA',
            gradeLevel: '9',
          }),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        });
        expect(rejectResponse.status).toBe(200);
        const applicationCount = await prisma.freeTierApplication.count({
          where: { email },
        });
        expect(applicationCount).toBe(0);

        await page.goto(`/free?t=${encodeURIComponent(code)}`);
        await expect(page.getByRole('status')).toContainText(
          'This event link is closed.'
        );
        await shot(page, `02-${item.key}-repeat-deduped.png`);

        const afterRepeatScan = await prisma.acquisitionToken.findUniqueOrThrow(
          {
            where: { id: token.id },
            select: { scanCount: true, uses: true },
          }
        );
        const scanRowsAfterRepeat = await prisma.acquisitionTokenScan.count({
          where: { tokenId: token.id },
        });
        expect(afterRepeatScan.scanCount).toBe(afterFirstScan.scanCount);
        expect(scanRowsAfterRepeat).toBe(scanRowsAfterFirst);
        expect(afterRepeatScan.uses).toBe(afterFirstScan.uses);

        evidence.push(
          [
            `${item.key}: ${item.label}`,
            `tokenId: ${token.id}`,
            `email attempted: ${email}`,
            `scanCount after first visit: ${afterFirstScan.scanCount}`,
            `scan rows after first visit: ${scanRowsAfterFirst}`,
            `scanCount after same-browser repeat: ${afterRepeatScan.scanCount}`,
            `scan rows after same-browser repeat: ${scanRowsAfterRepeat}`,
            `uses after rejection: ${afterRepeatScan.uses}`,
            `applications created for attempted email: ${applicationCount}`,
            '',
          ].join('\n')
        );
      }

      await note('03-rejected-link-scan-evidence.txt', evidence.join('\n'));
    } finally {
      await prisma.freeTierApplication.deleteMany({
        where: {
          email: {
            in: cases.map((item) => `qa-${item.key}-${run}@example.com`),
          },
        },
      });
      for (const tokenId of tokenIds) {
        await prisma.acquisitionTokenScan
          .deleteMany({ where: { tokenId } })
          .catch(() => {});
        await prisma.acquisitionToken
          .delete({ where: { id: tokenId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  test('hosted demo run documents unavailable hosted assertions cleanly', async () => {
    const required = [
      'DEMO_FREE_TIER_BASE_URL',
      'DEMO_FREE_TIER_DISABLED_EVENT_TOKEN',
      'DEMO_FREE_TIER_EXPIRED_EVENT_TOKEN',
      'DEMO_FREE_TIER_DISABLED_AT_EVENT_TOKEN',
    ];
    const missing = required.filter((key) => !process.env[key]?.trim());
    if (missing.length) {
      await note(
        'hosted-demo-skip.txt',
        [
          'Hosted demo qa-disabled-expired run skipped.',
          `Missing env/access: ${missing.join(', ')}`,
          '',
          'Local faithful demo stand-in covers disabled, expired, and disabledAt event-link rejection, scanCount behavior, and same-browser scan de-dupe.',
        ].join('\n')
      );
      test.skip(true, `Hosted demo access missing: ${missing.join(', ')}`);
    }
    await note(
      'hosted-demo-skip.txt',
      [
        'Hosted demo qa-disabled-expired run skipped.',
        'Hosted demo rejected-link assertions are not implemented in this PR.',
        'Required hosted event tokens were present, but this QA suite avoids mutating hosted demo until the runner has a dedicated disposable rejected-link fixture contract.',
      ].join('\n')
    );
    test.skip(
      true,
      'Hosted demo assertions are documented as unavailable until disposable hosted fixtures exist.'
    );
  });
});
