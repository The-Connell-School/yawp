import { test, expect } from '../test-setup';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

test.describe('Writing Practice: See how it works', () => {
  test('opens the guide from Writing Practice and comes back', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/writing-lessons');

    await page.getByRole('link', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(/\/app\/writing-lessons\/how-it-works$/);

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /short lessons that sharpen student writing/i,
      })
    ).toBeVisible();
    await expect(page.getByTestId('guide-lessons')).toContainText(
      /grammar & mechanics/i
    );
    // The section a school approving the Tutor reads first.
    const wont = page.getByTestId('guide-wont');
    await expect(wont).toContainText(/write a student’s revision for them/i);
    await expect(wont).toContainText(/send student names to the ai/i);
    await expect(wont).toContainText(/count toward grades/i);
    // The clips are served from the app, not an outside site.
    await expect(page.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/writing-practice-guide\/.+\.mp4$/
    );

    await page.getByRole('link', { name: /back to writing practice/i }).click();
    await expect(page).toHaveURL(/\/app\/writing-lessons$/);
  });

  test('keeps the guide teacher-only', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
    await page.goto('/app/writing-lessons');
    await expect(page.getByTestId('writing-practice-hero')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toHaveCount(0);

    await page.goto('/app/writing-lessons/how-it-works');
    await expect(page).toHaveURL(/\/app\/writing-lessons$/);
  });

  test('keeps the guide in bounds on a phone', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/app/writing-lessons');
    // Icon only at this width, still named for anyone using a screen reader.
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toBeVisible();

    await page.goto('/app/writing-lessons/how-it-works');
    await expect(page.getByTestId('guide-wont')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
