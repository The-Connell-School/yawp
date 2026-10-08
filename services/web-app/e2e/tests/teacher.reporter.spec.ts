import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

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

  test('stays in the sidebar for SCHOOL orgs when reporterEnabled is off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setReporterEnabled(e2eContext.organizationId, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await expect(page.getByRole('link', { name: 'Reporter' })).toBeVisible();
  });

  test('opens /app/reporter when reporterEnabled is false', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setReporterEnabled(e2eContext.organizationId, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto('/app/reporter');
    await expect(page).toHaveURL(/\/app\/reporter/);
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

  test('opens the how-it-works guide from the Reporter header', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/reporter');

    await page.getByRole('link', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(/\/app\/reporter\/how-it-works$/);

    await expect(
      page.getByRole('heading', { level: 1, name: /ask about your classes/i })
    ).toBeVisible();
    // The starter cards come first, so a reader sees what Reporter can run.
    const reports = page.getByTestId('guide-reports');
    await expect(reports).toContainText(/growth report for a student/i);
    await expect(reports).toContainText(/who needs attention/i);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: /track student growth over time/i,
      })
    ).toBeVisible();
    await expect(page.getByTestId('guide-uses')).toContainText(
      /parent-teacher conferences/i
    );
    // The section a school approving Reporter reads first.
    const wont = page.getByTestId('guide-wont');
    await expect(wont).toContainText(/change, give, or release grades/i);
    await expect(wont).toContainText(/other teachers’ classes/i);
    // The clips are served from the app, not an outside site.
    await expect(page.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/reporter-guide\/.+\.mp4$/
    );

    await page.getByRole('link', { name: /back to reporter/i }).click();
    await expect(page).toHaveURL(/\/app\/reporter$/);
  });

  test('keeps the how-it-works guide teacher-only', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
    await page.goto('/app/reporter/how-it-works');
    await expect(page).toHaveURL(/\/app(?!\/reporter)/);
  });

  test('keeps the how-it-works guide in bounds on a phone', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/app/reporter');
    // Icon only at this width, still named for anyone using a screen reader.
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toBeVisible();

    await page.goto('/app/reporter/how-it-works');
    await expect(page.getByTestId('guide-wont')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('keeps Reporter controls in bounds at desktop and mobile breakpoints', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await setReporterEnabled(e2eContext.organizationId, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/app/reporter');

      const composer = page.getByLabel('Message Yawp Reporter');
      const send = page.getByRole('button', { name: 'Send message' });
      await expect(composer).toBeVisible();
      await expect(send).toBeVisible();
      if (viewport.width === 390) {
        await expect(page.getByLabel('Past reports')).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'New report' })
        ).toBeVisible();
      }

      for (const control of [composer, send]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - window.innerWidth,
        document: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(overflow.body).toBeLessThanOrEqual(0);
      expect(overflow.document).toBeLessThanOrEqual(0);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
