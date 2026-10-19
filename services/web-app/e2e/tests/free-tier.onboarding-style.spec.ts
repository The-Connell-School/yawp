import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';
import { waitForFreeTierEmailPayload } from '../helpers/free-tier-email';

// Runs against the normal captured-mail E2E server. Optional lane evidence uses
// the same routes/fixtures at identical viewports before and after the change.
const before = process.env.ONBOARDING_EVIDENCE_PHASE === 'before';
const evidence = process.env.ONBOARDING_EVIDENCE_DIR;
for (const viewport of [
  { width: 1280, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`onboarding uses login controls and completes approval at ${viewport.width}px`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const prisma = createE2EPrismaClient();
    const stamp = `artboard-${viewport.width}`;
    const capture = async (state: string, target = page) => {
      await target.locator('h1').waitFor();
      await target.locator('h1').click();
      await expect(target.locator('[role="progressbar"] > div')).toHaveCSS(
        'opacity',
        '0'
      );
      await target.evaluate(() => {
        window.scrollTo(0, 0);
        return document.fonts.ready;
      });
      if (!before && state !== 'sign-in') {
        await expect(target.locator('.auth-page-content > .free-tier-form-card')).toBeVisible();
        const geometry = await target
          .locator('.auth-page-content > .free-tier-form-card')
          .evaluate((el) => {
            const s = getComputedStyle(el);
            return {
              width: s.width,
              left: String(el.getBoundingClientRect().left),
              top: String(el.getBoundingClientRect().top),
              padding: s.padding,
              borderRadius: s.borderRadius,
              background: s.backgroundColor,
              shadow: s.boxShadow,
            };
          });
        expect(geometry).toMatchObject({
          width: '320px', padding: '24px', borderRadius: '12px',
          background: 'rgb(255, 255, 255)',
        });
        await expect(target.locator('.free-tier-page h1')).toHaveCSS('line-height', '24.3px');
        const fields = target.locator('.free-tier-page input:not([type="hidden"]):not(.hidden)');
        if (await fields.count()) await expect(fields.first()).toHaveCSS('font-size', '16px');
        await expect(target.locator('[class*="yawp-entry"]')).toHaveCount(0);
      }
      if (evidence) {
        fs.mkdirSync(evidence, { recursive: true });
        const filename = `${viewport.width}-${state}.png`;
        const mask = [];
        for (const input of await target
          .locator('input[type="password"]')
          .all()) {
          if (await input.inputValue()) mask.push(input);
        }
        await target.screenshot({
          path: path.join(evidence, filename),
          fullPage: true,
          mask,
        });
        fs.appendFileSync(
          path.join(evidence, 'manifest.jsonl'),
          JSON.stringify({
            state,
            route: new URL(target.url()).pathname,
            viewport,
            file: filename,
            fixture:
              'disposable local database identity; captured email; signed URLs omitted',
          }) + '\n'
        );
      }
    };
    const admin = await browser.newPage({ viewport });
    try {
      await page.goto('/auth/login');
      await capture('sign-in');
      await page.goto('/free');
      await capture('waitlist');
      if (!before) await expect(page.getByText('Join the waitlist. We let teachers in a group at a time.')).toBeVisible();
      await page
        .getByRole('button', { name: 'Join the waitlist', exact: true })
        .click();
      await expect(page.locator('input[name="name"]:invalid')).toHaveCount(1);
      for (const [field, value] of Object.entries({
        name: 'Grace Okafor',
        email: `wait-${stamp}@example.edu`,
        schoolName: 'Lincoln High School',
        location: 'Local',
        gradeLevel: '10',
      }))
        await page.locator(`input[name="${field}"]`).fill(value);
      await page
        .getByRole('button', { name: 'Join the waitlist', exact: true })
        .click();
      await expect(page.getByRole('status')).toContainText(
        "You're on the list"
      );
      await capture('waitlist-confirmation');
      for (const mode of ['waitlist', 'bypass', 'closed'] as const) {
        const code = `fixture-${stamp}-${mode}`;
        await prisma.acquisitionToken.create({
          data: {
            code,
            tokenHash: createHash('sha256').update(code).digest('hex'),
            label: 'Local fixture',
            bypassWaitlist: mode === 'bypass',
            ...(mode === 'closed' ? { disabledAt: new Date() } : {}),
          },
        });
        await page.goto(`/free?t=${code}`);
        await capture(`event-${mode}`);
        if (mode !== 'closed') {
          for (const [field, value] of Object.entries({
            name: 'Grace Okafor',
            email: `event-${mode}-${stamp}@example.edu`,
            schoolName: 'Lincoln High School',
            location: 'Local',
            gradeLevel: '10',
          }))
            await page.locator(`input[name="${field}"]`).fill(value);
          await page
            .getByRole('button', { name: 'Continue', exact: true })
            .click();
          await expect(page.getByRole('status')).toContainText(
            mode === 'bypass' ? 'Check your email' : "You're on the list"
          );
          await capture(`event-${mode}-confirmation`);
        }
      }
      await page.goto('/free?t=invalid-fixture-code');
      await capture('event-invalid');
      await page.goto('/free/join?t=invalid-fixture-token');
      await capture('join-invalid');
      await admin.goto('/free/admin/approve');
      await capture('approval-invalid', admin);
      await admin.goto('/free/admin/not-right-person');
      await capture('forward-invalid', admin);
      const app = await prisma.freeTierApplication.create({
        data: {
          email: `teacher-${stamp}@example.edu`,
          name: 'Grace Okafor',
          schoolName: 'Lincoln High School',
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
      await capture('account-creation');
      if (!before) await expect(page.getByRole('heading', { name: /^(Welcome to YAWP!|Create your free classroom)$/ })).toBeVisible();
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.locator('input[name="password"]:invalid')).toHaveCount(
        1
      );
      await page.locator('input[name="password"]').fill('yawp-e2e-pass-1');
      await page
        .locator('input[name="confirmPassword"]')
        .fill('different-password');
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.locator('button[type="submit"]')).toBeEnabled();
      if (!before) await expect(page.getByRole('alert')).toBeVisible();
      await capture('account-validation');
      await page
        .locator('input[name="confirmPassword"]')
        .fill('yawp-e2e-pass-1');
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.waitForURL('**/app/free-tier/onboarding**');
      await capture('teacher-approval-request');
      if (!before) {
        await expect(page.getByRole('heading', { name: 'Who can approve Yawp!' })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Approval progress' })).toContainText('Ask your administrator');
      }
      await prisma.freeTierEmailLog.create({
        data: {
          applicationId: app.id,
          kind: 'admin_approval',
          toEmail: 'principal@example.edu',
          success: false,
          error: 'local-fixture-provider-down',
        },
      });
      await prisma.freeTierApplication.update({
        where: { id: app.id },
        data: { status: 'ADMIN_SUBMITTED' },
      });
      await page.reload();
      await expect(page.getByRole('alert')).toBeVisible();
      await capture('teacher-approval-email-error');
      if (!before) {
        await expect(page.locator('[name="personalNote"]')).toHaveCount(0);
        await expect(
          page.getByText('Email preview', { exact: true })
        ).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Send approval request' }).click();
      await expect(page.locator('input[name="adminName"]:invalid')).toHaveCount(
        1
      );
      await page.locator('input[name="adminName"]').fill('Dr. Patel');
      await page
        .locator('input[name="adminEmail"]')
        .fill('patel@example.edu');
      await page.locator('input[name="adminRole"]').fill('Principal');
      // A crafted request must not restore the removed introduction.
      await page
        .locator('form')
        .first()
        .evaluate((form) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'personalNote';
          input.value = 'CRAFTED INTRO';
          form.appendChild(input);
        });
      await page.getByRole('button', { name: 'Send approval request' }).click();
      await page.waitForURL('**/app/free-tier/pending**');
      await capture('teacher-pending');
      if (!before)
        await expect(
          page.getByText('Email preview', { exact: true })
        ).toHaveCount(0);
      const initial = await waitForFreeTierEmailPayload(prisma, {
        applicationId: app.id,
        kind: 'admin_approval',
      });
      // Historical notes must also be ignored by reminders and replacement sends.
      await prisma.freeTierAdminApproval.updateMany({
        where: { applicationId: app.id },
        data: { personalNote: 'HISTORICAL INTRO' },
      });
      await page.getByRole('button', { name: 'Resend reminder' }).click();
      await expect(page.getByRole('status')).toContainText('Reminder sent');
      await capture('reminder-confirmation');
      const reminder = await waitForFreeTierEmailPayload(prisma, {
        applicationId: app.id,
        kind: 'admin_approval_reminder',
      });
      await admin.goto(initial.approveUrl);
      await capture('approval-replaced', admin);
      await admin.goto(reminder.notRightPersonUrl);
      await capture('administrator-forward', admin);
      await admin.locator('input[name="adminName"]').fill('Principal Lee');
      await admin
        .locator('input[name="adminEmail"]')
        .fill(`replacement-${stamp}@example.edu`);
      await prisma.freeTierApplication.update({
        where: { id: app.id },
        data: { adminRedirectCount: 100 },
      });
      await admin.getByRole('button', { name: 'Forward request' }).click();
      await expect(
        admin.getByRole('heading', { name: 'Unable to forward' })
      ).toBeVisible();
      await capture('forward-error', admin);
      await prisma.freeTierApplication.update({
        where: { id: app.id },
        data: { adminRedirectCount: 0 },
      });
      await admin.goto(reminder.notRightPersonUrl);
      await admin.locator('input[name="adminName"]').fill('Principal Lee');
      await admin
        .locator('input[name="adminEmail"]')
        .fill(`replacement-${stamp}@example.edu`);
      await admin.getByRole('button', { name: 'Forward request' }).click();
      await expect(
        admin.getByRole('heading', { name: 'Request forwarded' })
      ).toBeVisible();
      await capture('forward-confirmation', admin);
      const replacement = await waitForFreeTierEmailPayload(prisma, {
        applicationId: app.id,
        kind: 'admin_approval',
      });
      await admin.goto(replacement.approveUrl);
      await capture('administrator-approval', admin);
      await admin
        .getByRole('button', { name: 'Approve Yawp!', exact: true })
        .click();
      await expect(
        admin.locator('input[name="adminRole"]:invalid')
      ).toHaveCount(1);
      await admin.locator('input[name="adminRole"]').fill('Principal');
      await admin.getByRole('checkbox', { name: before ? /authorized/i : /I can approve classroom software/i }).check();
      await admin
        .getByRole('button', { name: 'Approve Yawp!', exact: true })
        .click();
      await expect(
        admin.getByRole('heading', { name: 'Thank you', exact: true })
      ).toBeVisible({ timeout: 30_000 });
      if (!before) await expect(admin.getByText('Grace Okafor can now start using Yawp! We let them know.', { exact: true })).toBeVisible();
      await capture('approval-confirmation', admin);
      await admin.goto(replacement.approveUrl);
      await capture('approval-already-approved', admin);
      expect(
        (await prisma.freeTierApplication.findUnique({ where: { id: app.id } }))
          ?.status
      ).toBe('APPROVED');
      // Disposable status fixtures reach the same guarded routes without email.
      await prisma.freeTierEmailLog.deleteMany({ where: { applicationId: app.id, success: false } });
      for (const status of ['REJECTED', 'EXPIRED', 'MANUAL_REVIEW'] as const) {
        await prisma.freeTierApplication.update({
          where: { id: app.id },
          data: { status, organizationId: null },
        });
        await page.goto(
          status === 'MANUAL_REVIEW'
            ? '/app/free-tier/pending'
            : '/app/free-tier/status'
        );
        await capture(`teacher-${status.toLowerCase()}`);
        if (status === 'REJECTED') {
          const declined = await mintFreeTierLinkForE2E(prisma, {
            applicationId: app.id,
            purpose: 'ADMIN_APPROVE',
          });
          await admin.goto(
            `/free/admin/approve?t=${encodeURIComponent(declined.token)}`
          );
          await expect(
            admin.getByRole('heading', {
              name: before ? 'Request not approved' : 'This request is closed',
              exact: true,
            })
          ).toBeVisible();
          await capture('approval-declined', admin);
          const expired = await mintFreeTierLinkForE2E(prisma, {
            applicationId: app.id,
            purpose: 'ADMIN_APPROVE',
            ttlMs: -1000,
          });
          await admin.goto(
            `/free/admin/approve?t=${encodeURIComponent(expired.token)}`
          );
          await expect(
            admin.getByRole('heading', {
              name: before ? 'Link expired or already used' : 'This link expired or was used',
              exact: true,
            })
          ).toBeVisible();
          await capture('approval-expired', admin);
          expect(
            (
              await prisma.freeTierSignedLink.findUnique({
                where: { id: expired.linkId },
              })
            )?.usedAt
          ).toBeNull();
        }
      }
    } finally {
      await admin.close();
      await prisma.$disconnect();
    }
  });
}
