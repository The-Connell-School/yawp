import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

// Grammar lessons drill ACT multiple choice, but picking the right option and
// producing the fix are different skills — so the panel also takes a written
// correction, graded by the tutor. E2E runs offline (no ANTHROPIC_API_KEY), so
// the tutor degrades to its deterministic fallback, which must never report an
// unevaluated rewrite as correct.
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

  test('a student can answer the multiple choice and write the fix themselves', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // The page tells a student what this page is for.
    await expect(page.getByTestId('lesson-student-intro')).toBeVisible();
    await expect(page.getByTestId('lesson-teacher-intro')).toHaveCount(0);

    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/try it yourself/i)).toBeVisible();

    // Multiple choice still grades deterministically.
    await expect(panel.getByText(/choose the best answer/i)).toBeVisible();
    await panel.getByRole('radio').first().check();
    await panel.getByRole('button', { name: /check my answer/i }).click();
    await expect(page.getByTestId('act-result')).toBeVisible();

    // ...and there is somewhere to actually write the correction.
    const rewrite = panel.getByTestId('grammar-rewrite-response');
    await expect(rewrite).toBeVisible();
    await expect(rewrite).toBeEditable();

    await rewrite.fill(
      'The new phone costs over a thousand dollars; most students cannot afford it.'
    );
    await panel.getByRole('button', { name: /check my rewrite/i }).click();

    // Offline the tutor cannot judge correctness, so it must say so rather
    // than implying the rewrite passed.
    const feedback = panel.getByTestId('composition-result');
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText(/not checked yet/i);
    await expect(feedback).not.toContainText(/strong work/i);
  });

  test('an unchanged sentence is refused before it reaches the tutor', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    const panel = page.getByRole('complementary');
    const sentence = (
      await panel.getByTestId('grammar-rewrite').textContent()
    )?.trim();
    expect(sentence).toBeTruthy();

    await panel.getByTestId('grammar-rewrite-response').fill('   ');
    // A whitespace-only rewrite leaves the button disabled: nothing to check.
    await expect(
      panel.getByRole('button', { name: /check my rewrite/i })
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
  });
});
