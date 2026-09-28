import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

// The Composition strand of Writing Fundamentals Practice is constructed
// response, not ACT multiple choice: the student writes a topic sentence /
// thesis and the tutor feedback service responds. E2E runs offline (no
// ANTHROPIC_API_KEY), so the feedback service degrades to its deterministic
// self-check — which is exactly what we assert here.
test.describe.serial('Writing Fundamentals Practice — Composition', () => {
  // Writing practice ships dark behind the org flag (default false), so every
  // route here 302s to /app until it is switched on.
  test.beforeEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: true },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: false },
      });
    } finally {
      await prisma.$disconnect();
    }
  });
  test('surfaces a Composition section on the practice index', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing practice/i }).first()
    ).toBeVisible();

    // The two strands each get their own heading.
    await expect(
      page.getByRole('heading', { name: 'Grammar & Mechanics' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Composition' })
    ).toBeVisible();

    // Sections are collapsed by default; open Composition to reveal its lessons.
    await page.getByRole('button', { name: 'Composition' }).click();

    // Composition links through to the constructed-response lessons, grouped
    // into Making Claims (topic sentences, thesis) and Supporting Claims
    // (evidence, analysis).
    // Match on the card testids: lesson descriptions overlap (the Analysis
    // card's description mentions evidence), so a name regex is ambiguous.
    await expect(
      page.getByTestId('writing-lesson-card-topic-sentences')
    ).toBeVisible();
    await expect(
      page.getByTestId('writing-lesson-card-evidence')
    ).toBeVisible();
    await expect(
      page.getByTestId('writing-lesson-card-analysis')
    ).toBeVisible();
    await page
      .locator('a[href="/app/writing-lessons/thesis-statements"]')
      .click();
    await expect(
      page.getByRole('heading', { name: 'Thesis Statements' })
    ).toBeVisible();
  });

  test('a composition assignment reaches the student and records written attempts', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // Teacher assigns Topic Sentences (constructed response) to their class.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/topic-sentences');
    await page.locator('input[name="classIds"]').first().check();
    await page.locator('input[name="problemCount"]').fill('3');
    // Due date is required, so the form will not submit without it.
    await page.locator('input[name="dueAt"]').fill('2026-12-01');
    await page.getByRole('button', { name: /assign practice/i }).click();
    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to/i
    );

    // Student opens it and gets a writing box, not ACT answer choices.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');
    // The card opens the assignment itself, not the generic lesson page.
    await page
      .getByRole('link', { name: /start practice/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/writing-lessons\/assigned\//);
    await expect(
      page.getByRole('heading', { name: /problem 1 of/i })
    ).toBeVisible();
    await expect(page.getByText(/choose the best answer/i)).toHaveCount(0);

    const response = page.getByTestId('assigned-composition-response');
    await expect(response).toBeVisible();
    await response.fill(
      'The cafeteria menu punishes the students who most need a real lunch.'
    );
    await page.getByRole('button', { name: /check & save/i }).click();

    // Feedback appears and the attempt is recorded. Offline (e2e) the tutor
    // degrades to "developing", so the problem isn't mastered yet — the student
    // is offered a revision loop rather than being pushed straight on.
    await expect(
      page.getByTestId('assigned-composition-feedback')
    ).toBeVisible();
    const draftHistory = page.getByTestId('composition-draft-history');
    await expect(draftHistory).toBeVisible();
    await expect(draftHistory.getByText('Draft 1')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /revise & resubmit/i })
    ).toBeVisible();
    // Nothing mastered yet, but the attempt is on record.
    await expect(page.getByText(/0 of 3 mastered/i)).toBeVisible();

    // Revising keeps the earlier draft visible, so the progression builds up.
    await response.fill(
      'The cafeteria menu quietly punishes the students who most need a real lunch, and the school should fix it.'
    );
    await page.getByRole('button', { name: /revise & resubmit/i }).click();
    await expect(draftHistory.getByText('Draft 1')).toBeVisible();
    await expect(draftHistory.getByText('Draft 2')).toBeVisible();

    // The student can move on without being hard-blocked.
    await page.getByRole('button', { name: /skip for now/i }).click();
    await expect(
      page.getByRole('heading', { name: /problem 2 of/i })
    ).toBeVisible();

    // Teacher reads the student's exact writing in results.
    await page.request.post('/auth/logout');
    await page.context().clearCookies();
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');
    await page
      .getByRole('link', { name: /view results/i })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: /student progress/i })
    ).toBeVisible();
    const studentRow = page
      .getByTestId('student-progress-row')
      .filter({ hasText: '1/3' });
    await expect(studentRow).toBeVisible();
    await studentRow.click();

    const attempts = page.getByTestId('student-attempts');
    await expect(attempts).toBeVisible();
    await expect(attempts.getByText(/their response/i)).toBeVisible();
    await expect(
      attempts.getByText(/punishes the students who most need a real lunch/i)
    ).toBeVisible();
  });

  test('builds a self-directed session for either strand', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    // A composition skill builds a constructed-response set: a writing box,
    // never ACT answer choices.
    await page.goto(
      '/app/writing-lessons/practice?skills=topic-sentences&count=3'
    );
    await expect(
      page.getByRole('heading', { name: /problem 1 of 3/i })
    ).toBeVisible();
    await expect(page.getByTestId('composition-prompt')).toBeVisible();
    await expect(page.getByText(/choose the best answer/i)).toHaveCount(0);

    // A grammar skill builds the multiple-choice set as normal.
    await page.goto(
      '/app/writing-lessons/practice?skills=fixing-comma-splices&count=5'
    );
    await expect(page.getByText(/choose the best answer/i)).toBeVisible();

    // A skill that does not exist can never build a set.
    await page.goto('/app/writing-lessons/practice?skills=not-a-lesson');
    await expect(page).toHaveURL(/\/app\/writing-lessons$/);
  });

  test('lets a student make the practice about their own interest', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/topic-sentences');

    const panel = page.getByRole('complementary');
    await expect(panel.getByTestId('composition-topic-picker')).toBeVisible();

    // Name a topic before starting. E2E runs offline (no ANTHROPIC_API_KEY),
    // so AI generation degrades to the deterministic topic templates — choice
    // still works.
    await panel.getByTestId('composition-topic-input').fill('skateboarding');
    await panel.getByRole('button', { name: /make it mine/i }).click();

    const activeTopic = panel.getByTestId('composition-topic-active');
    await expect(activeTopic).toBeVisible();
    await expect(activeTopic).toContainText('skateboarding');

    // They can drop back to the standard prompts before starting.
    await panel.getByRole('button', { name: /use standard prompts/i }).click();
    await expect(panel.getByTestId('composition-topic-picker')).toBeVisible();

    // Name it again and start: the set itself is built around their interest.
    await panel.getByTestId('composition-topic-input').fill('skateboarding');
    await panel.getByRole('button', { name: /make it mine/i }).click();
    await panel.getByTestId('start-practice').click();

    await expect(page).toHaveURL(/topic=skateboarding/);
    await expect(page.getByTestId('composition-topic-active')).toContainText(
      'skateboarding'
    );
    await expect(
      page.getByText(/one opinion you hold about skateboarding/i)
    ).toBeVisible();
  });

  test('lets a student write a topic sentence and get tutor feedback', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/topic-sentences');

    await expect(
      page.getByRole('heading', { name: 'Topic Sentences' })
    ).toBeVisible();

    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/try it yourself/i)).toBeVisible();
    await panel.getByTestId('start-practice').click();

    // Constructed response, not multiple choice: there is a writing box and no
    // ACT answer choices — the same screen an assigned composition set uses.
    await expect(
      page.getByRole('heading', { name: /problem 1 of 3/i })
    ).toBeVisible();
    await expect(page.getByText(/choose the best answer/i)).toHaveCount(0);
    const response = page.getByTestId('assigned-composition-response');
    await expect(response).toBeVisible();

    // Nothing to check yet, so there is nothing to submit.
    await expect(
      page.getByRole('button', { name: /check my answer/i })
    ).toBeDisabled();

    // A real attempt gets real (here, offline-degraded) tutor feedback, and
    // the revise-and-master loop that assigned practice runs.
    await response.fill(
      'The cafeteria menu punishes the students who most need a real lunch.'
    );
    await page.getByRole('button', { name: /check my answer/i }).click();
    const feedback = page.getByTestId('assigned-composition-feedback');
    await expect(feedback.first()).toBeVisible();
    await expect(feedback.first()).toContainText(/tutor is offline/i);
    await expect(
      page.getByTestId('composition-draft-history').getByText('Draft 1')
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /revise & resubmit/i })
    ).toBeVisible();
    // Nothing was mastered, so the set's progress does not move.
    await expect(page.getByText(/0 of 3 mastered/i)).toBeVisible();

    // The student can move on to a fresh prompt without dead-ending.
    await page.getByRole('button', { name: /skip for now/i }).click();
    await expect(
      page.getByRole('heading', { name: /problem 2 of 3/i })
    ).toBeVisible();
    await expect(page.getByTestId('composition-draft-history')).toHaveCount(0);
  });
});
