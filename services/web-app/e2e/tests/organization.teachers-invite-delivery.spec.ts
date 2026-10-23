import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../test-setup';

const evidenceRoot =
  process.env.TEACHERS_INVITE_EVIDENCE_DIR ??
  '/opt/cursor/artifacts/teachers-invite-fix/after';

async function captureState(
  page: import('@playwright/test').Page,
  name: string,
  width: number
) {
  await page.setViewportSize({ width, height: 900 });
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceRoot, `${name}-${width}.png`),
    fullPage: true,
  });
}

test.describe('Organization teachers invite delivery UI', () => {
  test('captures invite sheet delivery states', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    test.skip(
      !process.env.RESEND_API_KEY,
      'Set RESEND_API_KEY so invite delivery hits the mocked Resend endpoint'
    );

    test.setTimeout(180000);
    await signIn(e2eContext.adminEmail, 'admin-e2e-password');
    await page.goto('/app/organization/teachers');
    await page.getByRole('button', { name: 'Invite Teacher' }).click();
    await expect(
      page.getByRole('heading', { name: 'Invite Teachers' })
    ).toBeVisible();

    const textarea = page.getByLabel(
      'Email addresses (comma or line separated)'
    );

    await textarea.fill('');
    await page.getByRole('button', { name: 'Send Invitations' }).click();
    await expect(page.getByText('Emails are required')).toBeVisible();
    for (const width of [320, 1280] as const) {
      await captureState(page, 'validation-emails-required', width);
    }

    await textarea.fill('not-an-email');
    await page.getByRole('button', { name: 'Send Invitations' }).click();
    await expect(page.getByText('No valid emails provided')).toBeVisible();
    for (const width of [320, 1280] as const) {
      await captureState(page, 'validation-no-valid-emails', width);
    }

    await page.route('https://api.resend.com/emails', async (route) => {
      const payload = JSON.parse(route.request().postData() ?? '{}') as {
        to?: string;
      };
      const shouldFail = payload.to?.includes('fail');
      await new Promise((resolve) => setTimeout(resolve, shouldFail ? 0 : 1200));
      if (shouldFail) {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            name: 'validation_error',
            message: 'Mock delivery failure',
            statusCode: 422,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'mock-email-id' }),
      });
    });

    await textarea.fill('pending-a@example.test, pending-b@example.test');
    const pendingClick = page
      .getByRole('button', { name: 'Send Invitations' })
      .click();
    await expect(page.getByRole('button', { name: 'Sending...' })).toBeVisible();
    for (const width of [320, 1280] as const) {
      await captureState(page, 'pending', width);
    }
    await pendingClick;

    await textarea.fill('teacher-one@example.test');
    await page.getByRole('button', { name: 'Send Invitations' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Invitation sent to 1 teacher.'
    );
    for (const width of [320, 1280] as const) {
      await captureState(page, 'success-1', width);
    }

    await textarea.fill(
      'teacher-a@example.test, teacher-b@example.test, teacher-c@example.test'
    );
    await page.getByRole('button', { name: 'Send Invitations' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Invitations sent to 3 teachers.'
    );
    for (const width of [320, 1280] as const) {
      await captureState(page, 'success-3', width);
    }

    await textarea.fill(
      'fail-a@example.test, fail-b@example.test, fail-c@example.test'
    );
    await page.getByRole('button', { name: 'Send Invitations' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      "We couldn't send your invitations. Check the addresses and try again."
    );
    for (const width of [320, 1280] as const) {
      await captureState(page, 'all-failed', width);
    }

    await textarea.fill(
      'teacher-ok@example.test, fail-partial@example.test, teacher-ok-2@example.test'
    );
    await page.getByRole('button', { name: 'Send Invitations' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Invitations sent to 2 teachers.'
    );
    await expect(page.getByRole('alert')).toHaveText(
      "We couldn't send to: fail-partial@example.test. Try again."
    );
    await expect(textarea).toHaveValue('fail-partial@example.test');
    for (const width of [320, 1280] as const) {
      await captureState(page, 'partial', width);
    }

    await page.unroute('https://api.resend.com/emails');
    await page.route(/\/app\/organization\/teachers\.data$/, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error:
              "Something went wrong and we couldn't confirm your invitations. Try again.",
          }),
        });
        return;
      }
      await route.continue();
    });

    await textarea.fill('server-error-a@example.test');
    await page.getByRole('button', { name: 'Send Invitations' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      "Something went wrong and we couldn't confirm your invitations. Try again."
    );
    for (const width of [320, 1280] as const) {
      await captureState(page, 'server-error', width);
    }

    const index = [
      'success-1-320.png / success-1-1280.png',
      'success-3-320.png / success-3-1280.png',
      'all-failed-320.png / all-failed-1280.png',
      'partial-320.png / partial-1280.png',
      'server-error-320.png / server-error-1280.png',
      'pending-320.png / pending-1280.png',
      'validation-emails-required-320.png / validation-emails-required-1280.png',
      'validation-no-valid-emails-320.png / validation-no-valid-emails-1280.png',
    ].join('\n');
    fs.writeFileSync(path.join(evidenceRoot, 'INDEX.txt'), `${index}\n`);
  });
});
