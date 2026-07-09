import { test, expect } from '../test-setup';

test.describe.serial('Writing Fundamentals Practice', () => {
  test('lets a student discover writing practice from the dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    // Students get a persistent "Practice" entry in the side menu.
    await expect(
      page.locator('nav a[href="/app/writing-lessons"]').first()
    ).toBeVisible();

    // ...plus a discovery card on the dashboard.
    const practiceLink = page.getByRole('link', {
      name: /writing fundamentals practice/i,
    });
    await expect(practiceLink).toBeVisible();

    await practiceLink.click();
    await expect(
      page.getByRole('heading', { name: /writing fundamentals practice/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
  });

  test('lets a student create their own mixed practice set', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await page.getByRole('button', { name: /create practice/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/skills to practice/i)).toBeVisible();
    await dialog.getByText('Fixing Comma Splices', { exact: true }).click();
    await dialog.getByText('Passive Voice', { exact: true }).click();
    await dialog.getByRole('button', { name: '10', exact: true }).click();
    await dialog.getByRole('button', { name: /start practice/i }).click();

    // Lands in a self-directed session with the chosen skills.
    await expect(
      page.getByRole('heading', { name: /grammar practice/i })
    ).toBeVisible();
    await expect(page.getByText(/try it yourself/i)).toBeVisible();
    await expect(page.getByText(/^Problem 1$/)).toBeVisible();

    // Answering a problem returns feedback.
    await page
      .getByLabel(/your answer/i)
      .fill('The album dropped; fans went wild.');
    await page.getByRole('button', { name: /check my answer/i }).click();
    await expect(page.getByTestId('practice-feedback')).toBeVisible();
  });

  test('loads lessons by direct URL and supports a self-guided practice check', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing fundamentals practice/i })
    ).toBeVisible();
    await expect(page.getByText(/quick rewrite drills/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /comma splices/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /pronoun agreement/i })
    ).toBeVisible();

    await page.getByRole('link', { name: /revising for wordiness/i }).click();

    await expect(
      page.getByRole('heading', { name: 'Revising for Wordiness' })
    ).toBeVisible();
    await expect(page.getByText(/try it yourself/i)).toBeVisible();

    // The self-serve panel now serves ACT English–style multiple choice: a
    // sentence with an underlined portion and four answer choices.
    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/choose the best answer/i)).toBeVisible();
    // The first offline question drills a padded opening phrase.
    await expect(panel.getByText(/committee has not reached/i)).toBeVisible();

    // Pick the concise correct answer and check — grading is deterministic and
    // works with no ANTHROPIC_API_KEY (E2E runs offline against the static bank).
    await panel.getByRole('radio', { name: /currently/i }).check();
    await page.getByRole('button', { name: /check my answer/i }).click();

    const result = page.getByTestId('act-result');
    await expect(result).toBeVisible();
    await expect(result.getByText(/correct!/i)).toBeVisible();
    await expect(result.getByText(/currently/i)).toBeVisible();

    // "New question" clears the result and serves a fresh item without ever
    // dead-ending. AI generation degrades to an empty batch offline, so the
    // panel cycles the static bank — but it must always show a question.
    const questionCounter = panel.getByText(/^Question \d+$/);
    for (let i = 0; i < 8; i++) {
      await page.getByRole('button', { name: /new question/i }).click();
      await expect(page.getByTestId('act-result')).toHaveCount(0);
      await expect(questionCounter).toBeVisible();
      await expect(panel.getByText(/choose the best answer/i)).toBeVisible();
    }
  });

  test('lets a teacher assign a lesson to one of their classes', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // Teachers get the assign panel (and, below it, the practice panel).
    const assignPanel = page.getByRole('complementary');
    await expect(
      assignPanel.getByRole('heading', { name: /assign to your classes/i })
    ).toBeVisible();
    await expect(page.getByTestId('act-result')).toHaveCount(0);

    const classCheckbox = page.locator('input[name="classIds"]').first();
    await classCheckbox.check();
    await page.locator('input[name="problemCount"]').fill('4');
    await page.getByRole('button', { name: /assign practice/i }).click();

    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to 1 class/i
    );
  });

  test('lets a teacher try the practice themselves and check with Enter', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // Teachers can now test-drive the lesson, not just assign it: the same ACT
    // "Try it yourself" panel students get sits alongside the assign panel.
    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/try it yourself/i)).toBeVisible();
    await expect(panel.getByText(/choose the best answer/i)).toBeVisible();

    // The first comma-splice item is fixed with a semicolon. Select it and
    // press Enter to check — no button click needed.
    const correct = panel.getByRole('radio', { name: /week; students/i });
    await correct.check();
    await correct.press('Enter');

    const result = page.getByTestId('act-result');
    await expect(result).toBeVisible();
    await expect(result.getByText(/correct!/i)).toBeVisible();
  });

  test('a teacher assignment reaches the student and records attempts', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // Teacher assigns the lesson to their (and the student's) class.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');
    await page.locator('input[name="classIds"]').first().check();
    await page.locator('input[name="problemCount"]').fill('4');
    await page.getByRole('button', { name: /assign practice/i }).click();
    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to/i
    );

    // Student sees it under "Assigned to you" and works a problem.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    const assignedCard = page.getByTestId('assigned-practice-card').first();
    await expect(assignedCard).toBeVisible();
    await assignedCard.click();

    await expect(
      page.getByRole('heading', { name: /problem 1 of/i })
    ).toBeVisible();

    await page
      .getByLabel(/your practice response/i)
      .fill(
        'The new phone costs over a thousand dollars; most students can’t afford it.'
      );
    await page.getByRole('button', { name: /check & save/i }).click();

    // Feedback appears and the attempt is recorded (progress advances).
    await expect(page.getByTestId('practice-feedback')).toBeVisible();
    await expect(page.getByText(/1 of 4 done/i)).toBeVisible();

    await page.getByRole('button', { name: /next problem/i }).click();
    await expect(
      page.getByRole('heading', { name: /problem 2 of/i })
    ).toBeVisible();

    // Teacher can see that the student has started (1 of 4 problems).
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');
    await page.getByTestId('assigned-by-teacher-card').first().click();
    await expect(
      page.getByRole('heading', { name: /student progress/i })
    ).toBeVisible();
    const studentRow = page
      .getByTestId('student-progress-row')
      .filter({ hasText: '1/4' });
    await expect(studentRow).toBeVisible();

    // And can expand that student to read the exact answer and its feedback.
    await studentRow.click();
    const attempts = page.getByTestId('student-attempts');
    await expect(attempts).toBeVisible();
    await expect(attempts.getByText(/student answer/i)).toBeVisible();
    // The student's fix (semicolon) is distinct from the prompt (comma splice).
    await expect(
      attempts.getByText(/thousand dollars; most students/i)
    ).toBeVisible();
  });

  test('a teacher assigns interleaved writing practice from the create-assignment sheet', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    // Teachers reach writing practice under the Assignments section (as a tile),
    // not a standalone Practice section.
    await expect(
      page
        .getByTestId('teacher-assignments-grid')
        .getByText(/writing fundamentals practice/i)
    ).toBeVisible();

    await page
      .getByRole('button', { name: /create assignment|new assignment/i })
      .first()
      .click();

    // Pick "Writing Fundamentals Practice" as the assignment type.
    await page.getByRole('combobox').first().click();
    await page
      .getByRole('option', { name: /writing fundamentals practice/i })
      .click();

    const dialog = page.getByRole('dialog');
    // First checkbox is the class; then pick two skills to interleave.
    await dialog.getByRole('checkbox').first().click();
    await dialog.getByText('Fixing Comma Splices', { exact: true }).click();
    await dialog.getByText('Passive Voice', { exact: true }).click();
    await dialog.getByRole('button', { name: '10', exact: true }).click();

    await dialog.getByRole('button', { name: /assign practice/i }).click();

    // The sheet closes on a successful assign.
    await expect(
      page.getByRole('button', { name: /assign practice/i })
    ).toHaveCount(0);
  });

  test('offers "Writing Fundamentals Practice" in the Assignments page type dropdown', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/assignments');

    await page.getByRole('button', { name: /new assignment/i }).click();

    const dialog = page.getByRole('dialog');
    // Open the assignment-type dropdown and choose writing practice.
    await dialog.getByRole('combobox').first().click();
    await page
      .getByRole('option', { name: /writing fundamentals practice/i })
      .click();

    // The sheet body swaps to the writing-practice builder.
    await expect(dialog.getByText(/skills to practice/i)).toBeVisible();
    await expect(dialog.getByText(/how many problems/i)).toBeVisible();
  });

  test('the writing-practice page has a direct "New practice assignment" entry point', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');

    await page
      .getByRole('button', { name: /new practice assignment/i })
      .click();

    // Opens straight into the writing-practice builder.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/skills to practice/i)).toBeVisible();
    await expect(dialog.getByText(/how many problems/i)).toBeVisible();
  });
});
