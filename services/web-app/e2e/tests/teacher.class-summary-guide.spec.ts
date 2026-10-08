import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

async function setClassInsightsEnabled(
  e2eContext: E2EContext,
  enabled: boolean
) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.organization.update({
      where: { id: e2eContext.organizationId },
      data: { classInsightsEnabled: enabled },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Class summary: See how it works', () => {
  test.afterEach(async ({ e2eContext }) => {
    await setClassInsightsEnabled(e2eContext, true);
  });

  test('opens the guide from the summary page and comes back', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const summaryPath = `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`;
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(summaryPath);
    await expect(page.getByTestId('class-summary-page')).toBeVisible();

    await page.getByRole('link', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(/\/app\/class-summary\/how-it-works\?from=/);

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /see how your whole class did/i,
      })
    ).toBeVisible();
    await expect(page.getByTestId('guide-parts')).toContainText(
      /differentiation starting points/i
    );
    // The section a school approving the summary reads first.
    const wont = page.getByTestId('guide-wont');
    await expect(wont).toContainText(
      /send student names, essays, or your comments to the ai/i
    );
    await expect(wont).toContainText(/use ai to sort students into groups/i);
    await expect(wont).toContainText(/show the summary to students/i);
    // The clips are served from the app, not an outside site.
    await expect(page.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/class-summary-guide\/.+\.mp4$/
    );

    await page
      .getByRole('link', { name: 'Back to the summary' })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`${summaryPath}$`));
  });

  test('only goes back to a class summary page', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(
      '/app/class-summary/how-it-works?from=https://example.com/elsewhere'
    );
    await expect(
      page.getByRole('link', { name: 'Back to My Classes' })
    ).toHaveAttribute('href', '/app/my-classes');
  });

  test('is not offered when class summaries are off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setClassInsightsEnabled(e2eContext, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await expect(
      page.getByTestId('class-summary-insights-disabled')
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toHaveCount(0);

    await page.goto('/app/class-summary/how-it-works');
    await expect(page).toHaveURL(/\/app(?!\/class-summary)/);
  });

  test('keeps the guide teacher-only', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
    await page.goto('/app/class-summary/how-it-works');
    await expect(page).toHaveURL(/\/app(?!\/class-summary)/);
  });

  test('keeps the guide in bounds on a phone', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const summaryPath = `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`;
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(summaryPath);
    // Icon only at this width, still named for anyone using a screen reader.
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toBeVisible();

    await page.goto(`/app/class-summary/how-it-works?from=${summaryPath}`);
    await expect(page.getByTestId('guide-wont')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
