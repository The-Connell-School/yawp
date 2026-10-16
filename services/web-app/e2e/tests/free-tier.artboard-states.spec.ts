import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';

const require = createRequire(import.meta.url);
const { encode } = require(
  require.resolve('turbo-stream', { paths: [require.resolve('react-router')] })
);
const evidence = process.env.ONBOARDING_EVIDENCE_DIR;

// Intercept only action responses to inspect rare presentation states. Normal
// loader guards, controls and validation still run. No provider receives mail.
for (const width of [1280, 390]) {
  test(`free-tier rare action states at ${width}px`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const viewport = { width, height: width === 1280 ? 1000 : 844 };
    await page.setViewportSize(viewport);
    const prisma = createE2EPrismaClient();
    const admin = await browser.newPage({ viewport });
    const stamp = `${Date.now()}-${width}`;
    const capture = async (state: string, target: Page = page) => {
      await target.locator('h1').waitFor();
      await target.locator('h1').click();
      await target.evaluate(() => document.fonts.ready);
      if (!evidence) return;
      fs.mkdirSync(evidence, { recursive: true });
      const filename = `${width}-${state}.png`;
      await target.screenshot({
        path: path.join(evidence, filename),
        fullPage: true,
        mask: await target.locator('input[type="password"]').all(),
      });
      fs.appendFileSync(
        path.join(evidence, 'manifest.jsonl'),
        JSON.stringify({
          state,
          route: new URL(target.url()).pathname,
          viewport,
          file: filename,
          fixture:
            'Local disposable records; intercepted single-fetch action response; no mail/provider calls; signed URLs omitted',
        }) + '\n'
      );
    };
    const reply = async (
      target: Page,
      result: object,
      button: string,
      state: string,
      expected: RegExp
    ) => {
      const pattern = /\.data(?:\?|$)/;
      await target.route(pattern, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'text/x-script',
          body: await new Response(encode({ data: result })).text(),
        });
      });
      try {
        await target.getByRole('button', { name: button, exact: true }).click();
        await expect(target.getByText(expected).first()).toBeVisible();
        await expect(target.locator('[role="progressbar"] > div')).toHaveCSS(
          'opacity',
          '0'
        );
        await capture(state, target);
      } finally {
        await target.unroute(pattern);
      }
    };
    const fillWaitlist = async () => {
      for (const [field, value] of Object.entries({
        name: 'Grace Okafor',
        email: 'okafor@example.edu',
        schoolName: 'Lincoln High',
        location: 'Local',
        gradeLevel: '10',
      }))
        await page.locator(`input[name="${field}"]`).fill(value);
    };
    try {
      await page.goto('/free');
      await page
        .getByRole('button', { name: 'Join the waitlist', exact: true })
        .click();
      await expect(page.locator('input[name="name"]:invalid')).toHaveCount(1);
      await capture('waitlist-field-errors');
      await fillWaitlist();
      await reply(
        page,
        { ok: false, error: 'rate_limited' },
        'Join the waitlist',
        'waitlist-rate-limited',
        /Too many attempts/
      );
      for (const error of ['cap_reached', 'budget_exceeded']) {
        await page.goto('/free?t=invalid-presentation-fixture');
        await fillWaitlist();
        await reply(
          page,
          { ok: false, error },
          'Continue',
          `event-${error}`,
          error === 'cap_reached' ? /event is full/ : /event link is paused/
        );
        await expect(
          page.getByRole('link', { name: 'Join the waitlist', exact: true })
        ).toHaveAttribute('href', '/free');
      }
      const app = await prisma.freeTierApplication.create({
        data: {
          email: `rare-${stamp}@example.edu`,
          name: 'Grace Okafor',
          schoolName: 'Lincoln High',
          location: 'Local',
          gradeLevel: '10',
          status: 'INVITED',
          releasedAt: new Date(),
        },
      });
      const release = await mintFreeTierLinkForE2E(prisma, {
        applicationId: app.id,
        purpose: 'RELEASE',
      });
      await page.goto(`/free/join?t=${encodeURIComponent(release.token)}`);
      await page.locator('input[name="password"]').fill('yawp-e2e-pass-1');
      await page
        .locator('input[name="confirmPassword"]')
        .fill('yawp-e2e-pass-1');
      await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
      await page.waitForURL('**/app/free-tier/onboarding**');
      await page
        .getByRole('button', { name: 'Send approval request', exact: true })
        .click();
      await expect(page.locator('input[name="adminName"]:invalid')).toHaveCount(
        1
      );
      await capture('onboarding-field-errors');
      for (const [reason, state, message] of [
        [
          'email_failed',
          'onboarding-email-failed',
          /send the (approval )?email/,
        ],
        [
          'illegal_state',
          'onboarding-not-ready',
          /ready for administrator details/,
        ],
        ['invalid', 'onboarding-something-wrong', /Something went wrong/],
      ] as const) {
        await page.goto('/app/free-tier/onboarding');
        await page.locator('input[name="adminName"]').fill('Dr. Patel');
        await page
          .locator('input[name="adminEmail"]')
          .fill('patel@example.edu');
        await page.locator('input[name="adminRole"]').fill('Principal');
        await reply(
          page,
          { ok: false, reason },
          'Send approval request',
          state,
          message
        );
      }
      // Hold a response to capture submission without changing enabled behavior.
      await page.goto('/app/free-tier/onboarding');
      await page.locator('input[name="adminName"]').fill('Dr. Patel');
      await page.locator('input[name="adminEmail"]').fill('patel@example.edu');
      await page.locator('input[name="adminRole"]').fill('Principal');
      let releaseReply!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseReply = resolve;
      });
      await page.route(/\.data(?:\?|$)/, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await gate;
        await route.fulfill({
          status: 200,
          contentType: 'text/x-script',
          body: await new Response(
            encode({ data: { ok: false, reason: 'invalid' } })
          ).text(),
        });
      });
      try {
        const sent = page.waitForRequest(
          (request) =>
            request.method() === 'POST' && request.url().includes('.data')
        );
        await page
          .getByRole('button', { name: 'Send approval request', exact: true })
          .click();
        await sent;
        await capture('onboarding-sending');
      } finally {
        releaseReply();
      }
      await expect(
        page.getByText('Something went wrong. Try again.')
      ).toBeVisible();
      await page.unroute(/\.data(?:\?|$)/);
      expect(
        (
          await prisma.freeTierApplication.findUniqueOrThrow({
            where: { id: app.id },
          })
        ).status
      ).toBe('ACCOUNT_CREATED');
      await prisma.freeTierApplication.update({
        where: { id: app.id },
        data: { status: 'SENT' },
      });
      const approve = await mintFreeTierLinkForE2E(prisma, {
        applicationId: app.id,
        purpose: 'ADMIN_APPROVE',
      });
      const forward = await mintFreeTierLinkForE2E(prisma, {
        applicationId: app.id,
        purpose: 'ADMIN_NOT_RIGHT_PERSON',
      });
      const approvePath = `/free/admin/approve?t=${encodeURIComponent(approve.token)}`;
      await admin.goto(approvePath);
      await admin
        .getByRole('button', { name: 'Approve YAWP', exact: true })
        .click();
      await expect(
        admin.locator('input[name="adminRole"]:invalid')
      ).toHaveCount(1);
      await capture('approval-field-errors', admin);
      for (const reason of ['email_failed', 'budget_exceeded']) {
        await admin.goto(approvePath);
        await admin.locator('input[name="adminRole"]').fill('Principal');
        await admin.getByRole('checkbox').check();
        await reply(
          admin,
          { ok: false, reason },
          'Approve YAWP',
          `approval-${reason}`,
          reason === 'email_failed'
            ? /approval.*(saved|recorded)|recorded your approval/
            : /budget/
        );
      }
      await admin.goto(
        `/free/admin/not-right-person?t=${encodeURIComponent(forward.token)}`
      );
      await admin
        .getByRole('button', { name: 'Forward request', exact: true })
        .click();
      await expect(
        admin.locator('input[name="adminName"]:invalid')
      ).toHaveCount(1);
      await capture('forward-field-errors', admin);
      await admin.locator('input[name="adminName"]').fill('Ms. Rivera');
      await admin
        .locator('input[name="adminEmail"]')
        .fill('rivera@example.edu');
      await reply(
        admin,
        { ok: false, reason: 'email_failed' },
        'Forward request',
        'forward-email-failed',
        /send the email/
      );
    } finally {
      await admin.close();
      await prisma.$disconnect();
    }
  });
}
