import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';

async function setReporterEnabled(organizationId: string, enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { reporterEnabled: enabled },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Yawp Reporter', () => {
  test.afterEach(async ({ e2eContext }) => {
    // Leave the org in its default (disabled) state for other specs.
    await setReporterEnabled(e2eContext.organizationId, false);
  });

  test('is hidden and unreachable when the org flag is off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setReporterEnabled(e2eContext.organizationId, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // No sidebar entry.
    await expect(
      page.getByRole('link', { name: 'Reporter' })
    ).toHaveCount(0);

    // Direct navigation redirects back into the app, away from the reporter.
    await page.goto('/app/reporter');
    await expect(page).toHaveURL(/\/app(?!\/reporter)/);
  });

  test('lets an enabled teacher open the reporter and start a report', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setReporterEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    // Reporter appears in the sidebar and opens.
    await page.getByRole('link', { name: 'Reporter' }).click();
    await expect(page).toHaveURL(/\/app\/reporter/);

    // Empty state with the recommended starter prompts.
    await expect(
      page.getByRole('heading', { name: /what would you like to know/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /grade report for a class/i })
    ).toBeVisible();

    // Picking a starter prompt optimistically posts the teacher's message.
    await page
      .getByRole('button', { name: /growth report for a student/i })
      .click();
    await expect(page.locator('[data-role="user"]').first()).toBeVisible();
    await expect(page.getByText(/pulling the numbers/i)).toBeVisible();
  });

  test('supports typing a custom question', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setReporterEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/reporter');

    const composer = page.getByLabel('Message Yawp Reporter');
    await composer.fill('How is my first period class doing?');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(
      page.getByText('How is my first period class doing?')
    ).toBeVisible();
    // Composer clears after sending.
    await expect(composer).toHaveValue('');
  });
});
