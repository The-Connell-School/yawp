import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';

// Brian's teacher-facing assignment type pages (Oct 31 copy edits), behind
// `assignment-type-landing-v2` and, for The Thesis-Driven Essay,
// `assignment-type-landing-thesis-essay`. The other specs on these pages run
// with both off and keep checking the old pages.

test.describe.serial('Assignment type landing pages (v2)', () => {
  test.afterAll(async () => {
    await setFeatureFlag('assignment-type-landing-v2', false);
    await setFeatureFlag('assignment-type-landing-thesis-essay', false);
  });

  test('Class Starter: Brian’s description, How it works, and the library, no Modules', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', true);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'Class Starter', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByText(
        'The Class Starter is the easiest way to get every student writing every day.',
        { exact: false }
      )
    ).toBeVisible();
    // How it works is a drop-down that starts closed.
    const howItWorks = page.getByRole('button', { name: 'How it works' });
    await expect(howItWorks).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Grading is about effort.')).toHaveCount(0);
    await howItWorks.click();
    await expect(howItWorks).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Grading is about effort.')).toBeVisible();
    await expect(
      page.getByText('Need an idea to get students thinking? Browse the library!')
    ).toBeVisible();

    // The old directions and the Modules block are gone.
    await expect(
      page.getByRole('heading', { name: 'How Class Starter works' })
    ).toHaveCount(0);
    await expect(page.getByText('For inspiration')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modules' })).toHaveCount(0);

    // The library itself still works the same way.
    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await expect(page.getByPlaceholder('Search prompts')).toBeVisible();
  });

  test('Exit Ticket: the short page replaces the six-section explainer', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', true);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );

    await expect(
      page.getByText("The Exit Ticket tells you whether today's lesson landed.", {
        exact: false,
      })
    ).toBeVisible();
    await expect(page.getByText('Tutor off or on?')).toHaveCount(0);
    await page.getByRole('button', { name: 'How it works' }).click();
    await expect(page.getByText('Tutor off or on?')).toBeVisible();
    await page.getByRole('button', { name: 'What makes a good exit ticket' }).click();
    await expect(page.getByText('Ask for one thing.')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'About exit tickets' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modules' })).toHaveCount(0);
  });

  test('The Thesis-Driven Essay stays on the old page until its own flag is on', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', true);
    await setFeatureFlag('assignment-type-landing-thesis-essay', false);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', {
        name: 'How the Thesis-Driven Essay library works',
      })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How to Teach It' })).toHaveCount(0);
  });

  test('The Thesis-Driven Essay: How to Teach It, and the library note inside the library', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', true);
    await setFeatureFlag('assignment-type-landing-thesis-essay', true);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await expect(
      page.getByText('The Thesis-Driven Essay is the big one', { exact: false })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How to Teach It' })).toBeVisible();
    await expect(
      page.getByText('Teach these steps in order! (Did we mention that?)')
    ).toBeVisible();
    // The course card: Brian's eight lessons with their plans and decks.
    const course = page.getByTestId('thesis-essay-course');
    await expect(
      course.getByRole('heading', { name: 'The Thesis-Driven Essay course' })
    ).toBeVisible();
    await expect(course.getByTestId('course-lesson')).toHaveCount(8);

    // A lesson plan is a PDF that opens in a new tab.
    const plan = course.getByRole('link', {
      name: 'Developing a thesis statement: lesson plan (PDF)',
    });
    await expect(plan).toHaveAttribute('target', '_blank');
    const planResponse = await page.request.get(
      (await plan.getAttribute('href'))!
    );
    expect(planResponse.ok()).toBe(true);
    expect((await planResponse.body()).subarray(0, 5).toString()).toBe('%PDF-');

    // A slide deck downloads as a PowerPoint file.
    const downloadPromise = page.waitForEvent('download');
    await course
      .getByRole('link', { name: 'Pre-writing: slide deck (PowerPoint)' })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Pre-Writing.pptx');
    await expect(
      course.getByRole('link', {
        name: 'Body paragraphs: supporting quotes slide deck (PowerPoint)',
      })
    ).toBeVisible();

    await expect(page.getByRole('button', { name: 'Modules' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', {
        name: 'How the Thesis-Driven Essay library works',
      })
    ).toHaveCount(0);

    // The note is at the top of the library, not with the explanation above.
    const note = page.getByTestId('prompt-library-note');
    await expect(note).toBeHidden();
    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await expect(note).toBeVisible();
    await expect(note).toContainText('75 essays with 75 different angles');
  });

  test('with the flag off, every page is the old one', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', false);
    await setFeatureFlag('assignment-type-landing-thesis-essay', true);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'How Class Starter works' })
    ).toBeVisible();
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );
    await expect(page.getByRole('heading', { name: 'How to Teach It' })).toHaveCount(0);
  });
});
