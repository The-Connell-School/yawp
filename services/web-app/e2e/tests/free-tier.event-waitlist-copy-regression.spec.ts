import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../test-setup';
import { setFreeTierFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const slug = 'qa-event-waitlist-copy-regression';
const shotsDir =
  process.env.FREE_TIER_QA_SHOTS_DIR ||
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-event-waitlist-copy-regression';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function writeArtifact(name: string, contents: string) {
  await fs.mkdir(shotsDir, { recursive: true });
  await fs.writeFile(path.join(shotsDir, name), contents);
}

test.describe.serial('Free tier event waitlist copy regression', () => {
  test.beforeEach(async () => {
    await fs.mkdir(shotsDir, { recursive: true });
  });

  test.afterAll(async () => {
    await setFreeTierFlag(true);
  });

  test('local demo stand-in keeps non-bypass event submissions waitlisted before showing copy', async ({
    page,
  }) => {
    await setFreeTierFlag(true);
    const prisma = createE2EPrismaClient();
    const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const code = `qa-${randomBytes(8).toString('base64url')}`;
    const email = `qa-event-waitlist-copy-${stamp}@yawp.local`;
    let tokenId: string | null = null;
    let applicationId: string | null = null;

    try {
      const token = await prisma.acquisitionToken.create({
        data: {
          code,
          tokenHash: hashToken(code),
          label: `${slug}-${stamp}`,
          bypassWaitlist: false,
          maxUses: 5,
          sourceName: 'free-tier QA',
          eventLocation: 'local demo stand-in',
          notes: 'Focused repro for non-bypass event link copy regression.',
        },
        select: { id: true, code: true },
      });
      tokenId = token.id;

      await page.goto(`/free?t=${encodeURIComponent(token.code!)}`);
      await expect(page.getByRole('heading', { name: /Try YAWP/i })).toBeVisible();
      await page.screenshot({ path: path.join(shotsDir, '01-event-form-before-submit.png'), fullPage: true });

      await page.fill('input[name="name"]', 'QA Event Waitlist');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="schoolName"]', 'QA Demo High');
      await page.fill('input[name="location"]', 'Demo');
      await page.fill('input[name="gradeLevel"]', '10');
      await page.getByRole('button', { name: /Continue/i }).click();

      const status = page.getByRole('status');
      await expect(status).toBeVisible();
      const visibleCopy = (await status.textContent())?.trim() || '';
      await page.screenshot({ path: path.join(shotsDir, '02-after-submit-copy.png'), fullPage: true });

      const app = await prisma.freeTierApplication.findUnique({
        where: { email },
        select: {
          id: true,
          status: true,
          acquisitionTokenId: true,
          releasedAt: true,
        },
      });
      expect(app).toBeTruthy();
      applicationId = app!.id;

      const releaseEmailCount = await prisma.freeTierEmailLog.count({
        where: { applicationId: applicationId!, kind: 'release' },
      });
      const releaseSignedLinkCount = await prisma.freeTierSignedLink.count({
        where: { applicationId: applicationId!, purpose: 'RELEASE' },
      });

      const evidence = {
        email,
        acquisitionTokenId: tokenId,
        application: app,
        releaseEmailCount,
        releaseSignedLinkCount,
        visibleCopy,
      };
      await writeArtifact('03-application-state.json', `${JSON.stringify(evidence, null, 2)}\n`);

      expect(app!.status).toBe('LEAD');
      expect(app!.acquisitionTokenId).toBe(tokenId);
      expect(app!.releasedAt).toBeNull();
      expect(releaseEmailCount).toBe(0);
      expect(releaseSignedLinkCount).toBe(0);

      await expect(status).toContainText(/You're on the list/i);
      await expect(status).not.toContainText(/join link/i);
    } finally {
      if (applicationId) {
        await prisma.freeTierSignedLink.deleteMany({ where: { applicationId } });
        await prisma.freeTierEmailLog.deleteMany({ where: { applicationId } });
        await prisma.freeTierApplication.deleteMany({ where: { id: applicationId } });
      } else {
        await prisma.freeTierApplication.deleteMany({ where: { email } });
      }
      if (tokenId) {
        await prisma.acquisitionTokenScan.deleteMany({ where: { tokenId } });
        await prisma.acquisitionToken.deleteMany({ where: { id: tokenId } });
      }
      await prisma.$disconnect();
    }
  });

  test('hosted demo fixture is explicit and non-mutating by default', async ({ page }) => {
    const hostedUrl = process.env.FREE_TIER_QA_HOSTED_DEMO_URL?.trim();
    const hostedToken = process.env.FREE_TIER_QA_HOSTED_DEMO_EVENT_TOKEN?.trim();
    const submitOptIn = process.env.FREE_TIER_QA_HOSTED_DEMO_SUBMIT === 'true';
    const fixtureEmail = process.env.FREE_TIER_QA_HOSTED_DEMO_EMAIL?.trim();

    if (!hostedUrl || !hostedToken) {
      await writeArtifact(
        'hosted-demo-skip.txt',
        [
          'Skipped hosted demo path.',
          'Missing FREE_TIER_QA_HOSTED_DEMO_URL or FREE_TIER_QA_HOSTED_DEMO_EVENT_TOKEN.',
          'No hosted demo mutation was attempted.',
        ].join('\n') + '\n'
      );
      test.skip(true, 'Hosted demo disposable fixture env is not configured.');
    }

    const url = new URL('/free', hostedUrl);
    url.searchParams.set('t', hostedToken);
    await page.goto(url.toString());
    await expect(page.getByRole('heading', { name: /Try YAWP/i })).toBeVisible();
    await page.screenshot({ path: path.join(shotsDir, 'hosted-demo-before-submit.png'), fullPage: true });

    if (!submitOptIn) {
      await writeArtifact(
        'hosted-demo-nonmutating.txt',
        [
          `Opened ${url.toString()}`,
          'FREE_TIER_QA_HOSTED_DEMO_SUBMIT was not true, so the test stopped before mutation.',
        ].join('\n') + '\n'
      );
      return;
    }
    if (!fixtureEmail) {
      await writeArtifact(
        'hosted-demo-skip.txt',
        'Missing FREE_TIER_QA_HOSTED_DEMO_EMAIL while FREE_TIER_QA_HOSTED_DEMO_SUBMIT=true; no hosted demo mutation was attempted.\n'
      );
      test.skip(true, 'Hosted demo submit opt-in requires FREE_TIER_QA_HOSTED_DEMO_EMAIL.');
    }

    await page.fill('input[name="name"]', 'QA Disposable Demo Fixture');
    await page.fill('input[name="email"]', fixtureEmail!);
    await page.fill('input[name="schoolName"]', 'QA Disposable Demo');
    await page.fill('input[name="location"]', 'Demo');
    await page.fill('input[name="gradeLevel"]', '10');
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('status')).toBeVisible();
    await page.screenshot({ path: path.join(shotsDir, 'hosted-demo-after-submit.png'), fullPage: true });
    await writeArtifact('hosted-demo-copy.txt', `${(await page.getByRole('status').textContent())?.trim()}\n`);
  });
});
