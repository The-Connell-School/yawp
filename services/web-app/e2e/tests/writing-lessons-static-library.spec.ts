import { test, expect } from '../test-setup';

test.describe.serial('Writing practice prototype', () => {
  test('keeps writing practice off the student dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('link', { name: /writing practice/i })
    ).toHaveCount(0);
  });

  test('loads lessons by direct URL and supports a self-guided practice check', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing practice/i })
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
    await expect(page.getByText(/practice prompt/i)).toBeVisible();
    await expect(
      page.getByRole('complementary').getByText('At this point in time')
    ).toBeVisible();

    await page
      .getByLabel(/your practice response/i)
      .fill('We cannot accept new applications now.');
    await page.getByRole('button', { name: /check response/i }).click();

    // Feedback is returned by the practice-feedback service. In E2E there is no
    // ANTHROPIC_API_KEY, so it uses the deterministic degraded fallback, which
    // still grounds its guidance in the lesson's skill.
    const feedback = page.getByTestId('practice-feedback');
    await expect(feedback).toBeVisible();
    await expect(feedback.getByText(/coming along/i)).toBeVisible();
    await expect(feedback.getByText(/revising for wordiness/i)).toBeVisible();
    await expect(feedback.getByText(/tutor offline/i)).toBeVisible();

    // Switching prompts clears the previous feedback.
    await page.getByRole('button', { name: /try another prompt/i }).click();
    await expect(page.getByTestId('practice-feedback')).toHaveCount(0);
    await expect(
      page.getByRole('complementary').getByText(/weak construction/i)
    ).toBeVisible();
  });

  test('lets a teacher assign a lesson to one of their classes', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // Teachers get the assign panel instead of the student practice panel.
    const assignPanel = page.getByRole('complementary');
    await expect(
      assignPanel.getByRole('heading', { name: /assign to your classes/i })
    ).toBeVisible();
    await expect(page.getByTestId('practice-feedback')).toHaveCount(0);

    const classCheckbox = page.locator('input[name="classIds"]').first();
    await classCheckbox.check();
    await page.locator('input[name="problemCount"]').fill('4');
    await page.getByRole('button', { name: /assign practice/i }).click();

    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to 1 class/i
    );
  });

  test('a teacher assignment reaches the student and records attempts', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

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
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');
    await page.getByTestId('assigned-by-teacher-card').first().click();
    await expect(
      page.getByRole('heading', { name: /student progress/i })
    ).toBeVisible();
    await expect(
      page.getByTestId('student-progress-row').filter({ hasText: '1/4' })
    ).toBeVisible();
  });

  test('a teacher assigns interleaved writing practice from the create-assignment sheet', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await page
      .getByRole('button', { name: /create assignment|new assignment/i })
      .first()
      .click();

    // Pick "Writing practice" as the assignment type.
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /writing practice/i }).click();

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

  test('offers "Writing practice" in the Assignments page type dropdown', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/assignments');

    await page.getByRole('button', { name: /new assignment/i }).click();

    const dialog = page.getByRole('dialog');
    // Open the assignment-type dropdown and choose writing practice.
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /writing practice/i }).click();

    // The sheet body swaps to the writing-practice builder.
    await expect(dialog.getByText(/skills to practice/i)).toBeVisible();
    await expect(dialog.getByText(/how many problems/i)).toBeVisible();
  });

  test('the writing-practice page has a direct "New practice assignment" entry point', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

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
