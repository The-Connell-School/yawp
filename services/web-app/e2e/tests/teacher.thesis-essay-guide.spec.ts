import { test, expect } from '../test-setup';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

test.describe('Thesis-Driven Essay: See how it works', () => {
  test('opens the guide from the assignment type page and comes back', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const pagePath = `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`;
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(pagePath);

    await page.getByRole('link', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(new RegExp(`${pagePath}/how-it-works$`));

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /teach the thesis-driven essay/i,
      })
    ).toBeVisible();
    // What the assignment is comes first: the essay beyond the five-paragraph.
    await expect(
      page.getByRole('region', {
        name: /any high school or college classroom/i,
      })
    ).toContainText(/five-paragraph essay/i);
    // The teacher teaches each step; the Tutor reinforces it. The guide has to
    // say that before it shows the Tutor.
    const how = page.getByRole('region', { name: /teach it, step by step/i });
    await expect(how).toContainText(/teacher creates the assignment/i);
    await expect(how).toContainText(/you teach the process/i);
    await expect(how).toContainText(/slide deck/i);
    await expect(how).toContainText(/students write alongside the tutor/i);
    // The Tutor gets its own highlighted section, with its own clips.
    const tutor = page.getByRole('region', {
      name: 'How the Tutor works with students',
    });
    await expect(tutor).toBeVisible();
    await expect(tutor).toContainText(/feedback on their own draft/i);
    await expect(tutor).toContainText(/cardinal rule/i);
    await expect(tutor).toContainText(/won’t write for the student/i);
    await expect(tutor).toContainText(/the refusal is the point/i);
    await expect(tutor).toContainText(/immediate feedback/i);
    await expect(tutor.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/thesis-essay-guide\/.+\.mp4$/
    );
    // Grading gets the same treatment: what it is, what it isn't, and why.
    const grading = page.getByRole('region', {
      name: /students submit.*grading assistant/i,
    });
    await expect(grading).toBeVisible();
    await expect(grading).toContainText(/a fully graded essay you can edit/i);
    await expect(grading).toContainText(/consistent and fair/i);
    // Tracking progress is a tip: cold write, teach, cold write again.
    await expect(
      page.getByRole('region', { name: /track student progress/i })
    ).toContainText(/start the year with a cold write/i);
    await expect(grading).toContainText(/what it isn’t/i);
    await expect(grading).toContainText(/until you release it/i);
    // The section a school approving the Tutor reads first.
    const wont = page.getByTestId('guide-wont');
    await expect(wont).toContainText(/write the essay for a student/i);
    await expect(wont).toContainText(/send student names to the tutor/i);
    await expect(wont).toContainText(/grade before you release it/i);
    // The clips are served from the app, not an outside site.
    await expect(page.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/thesis-essay-guide\/.+\.mp4$/
    );

    await page
      .getByRole('link', { name: /back to the thesis-driven essay/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`${pagePath}$`));
  });

  test('has no guide button on other assignment types', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Daily Pages' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toHaveCount(0);

    // And the guide's address sends a teacher back to the type's own page.
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}/how-it-works`
    );
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}$`
      )
    );
  });

  test('keeps the guide teacher-only', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}/how-it-works`
    );
    await expect(page).toHaveURL(/\/app(?!\/assignment-types)/);
  });

  test('keeps the guide in bounds on a phone', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const pagePath = `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`;
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(pagePath);
    // Icon only at this width, still named for anyone using a screen reader.
    await expect(
      page.getByRole('link', { name: 'See how it works' })
    ).toBeVisible();

    await page.goto(`${pagePath}/how-it-works`);
    await expect(page.getByTestId('guide-wont')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
