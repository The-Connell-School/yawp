import { test, expect } from '../test-setup';

const TEACHER_EMAIL = 'teacher.e2e@yawp.test';
const TEACHER_PASSWORD = 'teacher-e2e-password';

test.describe('teacher assignment-level class insights', () => {
  test('generates a class performance summary on demand', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/assignments/${e2eContext.assignmentId}`
    );

    // The panel is present but empty until the teacher asks for a summary.
    const panel = page.getByRole('heading', {
      name: /class performance summary/i,
    });
    await expect(panel).toBeVisible();

    const generateButton = page.getByRole('button', {
      name: /summarize class performance/i,
    });
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // The deterministic E2E fixture returns an overview, per-category calls,
    // and at least one rubric-tagged next step.
    await expect(page.getByText(/how the class did/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/suggested next steps/i)).toBeVisible();
    await expect(page.getByText(/based on \d+ submissions/i)).toBeVisible();

    // Once generated, the action becomes a regenerate affordance.
    await expect(
      page.getByRole('button', { name: /regenerate/i })
    ).toBeVisible();
  });

  test('cached summary is shown on reload', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);

    const assignmentUrl = `/app/my-classes/${e2eContext.classId}/assignments/${e2eContext.assignmentId}`;
    await page.goto(assignmentUrl);

    const generateButton = page.getByRole('button', {
      name: /summarize class performance|regenerate/i,
    });
    await generateButton.click();
    await expect(page.getByText(/suggested next steps/i)).toBeVisible({
      timeout: 15000,
    });

    // Reloading hydrates the cached insight from the loader (no button click).
    await page.goto(assignmentUrl);
    await expect(page.getByText(/how the class did/i)).toBeVisible();
    await expect(page.getByText(/suggested next steps/i)).toBeVisible();
  });
});
