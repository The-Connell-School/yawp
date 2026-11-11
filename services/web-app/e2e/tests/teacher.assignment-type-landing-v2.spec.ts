import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';
import { ensureWritingStepType } from '../fixtures/writing-step-types';

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
    // How it works is a box with its heading inside, closed on arrival (Nov 11).
    const box = page.getByTestId('landing-section-how-it-works');
    await expect(box.getByRole('heading', { name: 'How it works' })).toBeVisible();
    const howItWorks = box.getByRole('button', { name: 'Show How it works' });
    await expect(howItWorks).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Grading is about effort.')).toHaveCount(0);
    await howItWorks.click();
    await expect(box.getByRole('button', { name: 'Hide How it works' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(box.getByText('Grading is about effort.')).toBeVisible();
    // No loose paragraph under the box: the library intro is inside the library.
    await expect(
      page.getByText('Need an idea to get students thinking? Browse the library!')
    ).toBeHidden();

    // The old directions and the Modules block are gone.
    await expect(
      page.getByRole('heading', { name: 'How Class Starter works' })
    ).toHaveCount(0);
    await expect(page.getByText('For inspiration')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modules' })).toHaveCount(0);

    // The library itself still works the same way, with its intro at the top.
    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await expect(page.getByPlaceholder('Search prompts')).toBeVisible();
    await expect(page.getByTestId('prompt-library-note')).toHaveText(
      'Need an idea to get students thinking? Browse the library!'
    );
  });

  test('Pre-Writing: boxed sections in order, How to Teach It open, the YAWP! philosophy box, nothing loose', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', true);
    const typeId = await ensureWritingStepType(e2eContext.organizationId, 'prewriting');
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/assignment-types/${typeId}`);

    await expect(
      page.getByText('Step one of the critical essay writing process.')
    ).toBeVisible();
    const landing = page.getByTestId('assignment-type-landing');
    await expect(landing.getByRole('heading', { level: 2 })).toHaveText([
      'How to Teach It',
      'When to use it',
      'How it works',
      'YAWP! philosophy on essay prompts',
    ]);
    await expect(
      page.getByRole('button', { name: 'Hide How to Teach It' })
    ).toHaveAttribute('aria-expanded', 'true');
    for (const heading of ['When to use it', 'How it works', 'YAWP! philosophy on essay prompts']) {
      await expect(page.getByRole('button', { name: `Show ${heading}` })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    }
    await expect(page.getByText('Have your own prompt')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show How it works' }).click();
    await expect(
      page.getByText('Grading is on the focus and the critical thinking behind it.')
    ).toBeVisible();
    await page.getByRole('button', { name: 'Show YAWP! philosophy on essay prompts' }).click();
    const philosophy = page.getByTestId('landing-section-philosophy');
    await expect(philosophy).toContainText('students write their best essays');
    await expect(philosophy).not.toContainText('Note:');
  });

  test('Thesis Statement: boxed sections, How to Teach It open and the rest closed', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', true);
    const typeId = await ensureWritingStepType(e2eContext.organizationId, 'thesis_statement');
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/assignment-types/${typeId}`);

    await expect(page.getByTestId('assignment-type-landing').getByRole('heading', { level: 2 })).toHaveText([
      'How to Teach It',
      'When to use it',
      'How it works',
      'What makes a strong thesis',
    ]);
    await expect(
      page.getByRole('button', { name: 'Hide How to Teach It' })
    ).toHaveAttribute('aria-expanded', 'true');
    for (const heading of ['When to use it', 'How it works', 'What makes a strong thesis']) {
      await expect(page.getByRole('button', { name: `Show ${heading}` })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    }
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
    await page.getByRole('button', { name: 'Show How it works' }).click();
    await expect(page.getByText('Tutor off or on?')).toBeVisible();
    await page.getByRole('button', { name: 'Show What makes a good exit ticket' }).click();
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

  test('The Thesis-Driven Essay: How to Teach It, the YAWP! philosophy box under Pre-writing, and the library intro inside the library', async ({
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

    // Expanded on arrival; Hide collapses it to a preview, Show brings it back.
    const hide = page.getByRole('button', { name: 'Hide How to Teach It' });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    await hide.click();
    await expect(page.getByTestId('thesis-essay-course')).toHaveCount(0);
    await expect(page.getByTestId('how-to-teach-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Show How to Teach It' }).click();
    await expect(course.getByTestId('course-lesson')).toHaveCount(8);

    // The rows are the slide deck and the tutorial video, nothing else (Brian, Nov 6).
    await expect(course.getByRole('link', { name: /lesson plan/i })).toHaveCount(0);

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

    // Brian's note is the YAWP! philosophy box under the Pre-writing lesson,
    // closed until a teacher opens it (Nov 11).
    const prewritingRow = course
      .getByTestId('course-lesson')
      .filter({ hasText: 'Pre-writing' })
      .first();
    const philosophy = prewritingRow.getByTestId('landing-section-philosophy');
    await expect(philosophy.getByRole('heading', { name: 'YAWP! philosophy on essay prompts' })).toBeVisible();
    await expect(philosophy).not.toContainText('75 essays');
    await philosophy.getByRole('button', { name: 'Show YAWP! philosophy on essay prompts' }).click();
    await expect(philosophy).toContainText('75 essays with 75 different angles');

    // Nothing loose between How to Teach It and the library: the library's
    // intro is at the top of the library itself.
    const note = page.getByTestId('prompt-library-note');
    await expect(note).toBeHidden();
    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await expect(note).toBeVisible();
    await expect(note).toContainText('Have your own prompt?');
    await expect(note).not.toContainText('75 essays');
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
