import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

// Grammar practice is a set of ACT multiple-choice problems worked on the same
// screen an assigned set uses — a student starts one from the lesson page
// rather than poking at a preview panel. Picking the right option and
// producing the fix are different skills, so each checked problem also takes a
// written correction, graded by the tutor. E2E runs offline (no
// ANTHROPIC_API_KEY), so the tutor degrades to its deterministic fallback,
// which must never report an unevaluated rewrite as correct.
test.describe.serial('Writing Fundamentals Practice — Grammar', () => {
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

  test('a student starts their own practice set and works it like an assigned one', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // The page tells a student what this page is for.
    await expect(page.getByTestId('lesson-student-intro')).toBeVisible();
    await expect(page.getByTestId('lesson-teacher-intro')).toHaveCount(0);

    // The lesson hands them the real practice screen, not a preview of it.
    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/try it yourself/i)).toBeVisible();
    await panel.getByTestId('start-practice').click();

    await expect(page).toHaveURL(
      /\/app\/writing-lessons\/practice\?skills=fixing-comma-splices/
    );
    // ...which is the assigned-practice screen: a numbered problem, the set's
    // progress, and a way back to the lesson.
    await expect(
      page.getByText('Your practice', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /problem 1 of 5/i })
    ).toBeVisible();
    await expect(page.getByText(/0 of 5 done/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /review lesson: fixing comma splices/i })
    ).toBeVisible();

    // Multiple choice still grades deterministically, and counts on the set.
    await expect(page.getByText(/choose the best answer/i)).toBeVisible();
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: /check my answer/i }).click();
    await expect(page.getByTestId('act-result')).toBeVisible();
    await expect(page.getByText(/1 of 5 done/i)).toBeVisible();

    // ...and there is somewhere to actually write the correction.
    const rewrite = page.getByTestId('grammar-rewrite-response');
    await expect(rewrite).toBeVisible();
    await rewrite.fill(
      'The new phone costs over a thousand dollars; most students cannot afford it.'
    );
    await page.getByRole('button', { name: /check my rewrite/i }).click();

    // Offline the tutor cannot judge correctness, so it must say so rather
    // than implying the rewrite passed.
    const feedback = page.getByTestId('composition-result');
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText(/not checked yet/i);
    await expect(feedback).not.toContainText(/strong work/i);

    // The set moves on rather than dead-ending on one question.
    await page.getByRole('button', { name: /next problem/i }).click();
    await expect(
      page.getByRole('heading', { name: /problem 2 of 5/i })
    ).toBeVisible();
    await expect(page.getByTestId('act-result')).toHaveCount(0);
  });

  test('an empty rewrite is refused before it reaches the tutor', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      '/app/writing-lessons/practice?skills=fixing-comma-splices&count=5'
    );

    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: /check my answer/i }).click();

    await page.getByTestId('grammar-rewrite-response').fill('   ');
    // A whitespace-only rewrite leaves the button disabled: nothing to check.
    await expect(
      page.getByRole('button', { name: /check my rewrite/i })
    ).toBeDisabled();
  });

  test('a teacher sees the lesson framed for them, not for a student', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // Teacher-facing framing, and the practice reads as a preview.
    await expect(page.getByTestId('lesson-teacher-intro')).toBeVisible();
    await expect(page.getByTestId('lesson-student-intro')).toHaveCount(0);

    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/preview the practice/i)).toBeVisible();
    await expect(panel.getByText(/try it yourself/i)).toHaveCount(0);

    // ...alongside the assign panel a student never sees.
    await expect(panel.getByText(/assign to your classes/i)).toBeVisible();

    // The preview is the student's screen, not a different one.
    await panel.getByTestId('start-practice').click();
    await expect(
      page.getByRole('heading', { name: /problem 1 of 5/i })
    ).toBeVisible();
  });
});
