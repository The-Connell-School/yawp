import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Inline grammar issue actions', () => {
  test('student released view shows grammar tooltip without teacher-only action', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}`);
    await page.waitForLoadState('networkidle');

    const grammarMark = page.locator('.grammar-issue-mark').first();
    await expect(grammarMark).toBeVisible();

    await grammarMark.hover();
    await expect(
      page.getByText('E2E grammar highlight for student toggle.')
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^remove comment$/i })
    ).toHaveCount(0);
  });

  test('teacher grading view can remove a grammar issue from the inline tooltip', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${e2eContext.gradeId}?edit=1`);
    await page.waitForLoadState('networkidle');

    const grammarMark = page.locator('.grammar-issue-mark').first();
    await expect(grammarMark).toBeVisible();

    await grammarMark.hover();
    const removeButton = page.getByRole('button', {
      name: /^remove comment$/i,
    });
    await expect(removeButton).toBeVisible();

    await removeButton.click();
    await expect(removeButton).toHaveCount(0);
    await expect(page.locator('.grammar-issue-mark')).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.grammar-issue-mark')).toHaveCount(0);
  });

  test('teacher can remove multiple grammar issues before either save finishes', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const grammarIssues = {
      issues: [
        {
          id: 'e2e-concurrent-grammar-1',
          excerpt: 'importance of reading',
          kind: 'error',
          message: 'First concurrent grammar issue.',
        },
        {
          id: 'e2e-concurrent-grammar-2',
          excerpt: 'Reading expands',
          kind: 'style',
          message: 'Second concurrent grammar issue.',
        },
        {
          id: 'e2e-concurrent-grammar-3',
          excerpt: 'comprehension skills',
          kind: 'error',
          message: 'Grammar issue that should remain.',
        },
      ],
    };
    const pendingGrammarSaves: Array<() => void> = [];
    let grammarSaveRequestCount = 0;

    try {
      await prisma.submission.update({
        where: { id: e2eContext.submittedSubmissionId },
        data: { grammarIssues },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

      await page.route('**/api/domain/update-submission', async (route) => {
        const payload = route.request().postDataJSON() as {
          grammarIssues?: unknown;
        };
        if (!payload.grammarIssues) {
          await route.continue();
          return;
        }
        grammarSaveRequestCount += 1;
        await new Promise<void>((resolve) => {
          pendingGrammarSaves.push(resolve);
        });
        await route.continue();
      });

      await page.goto(
        `/app/submissions/${e2eContext.submittedSubmissionId}?edit=1`
      );
      await page.waitForLoadState('networkidle');

      await page
        .getByRole('button', { name: /Grammar\/Syntax\/Formatting/i })
        .click();
      await expect(page.getByText('AI grammar issues: 3')).toBeVisible();
      const removeButtons = page.getByRole('button', { name: /^remove$/i });
      await expect(removeButtons).toHaveCount(3);

      await page
        .getByText('First concurrent grammar issue.')
        .locator('..')
        .getByRole('button', { name: /^remove$/i })
        .click();
      await page
        .getByText('Second concurrent grammar issue.')
        .locator('..')
        .getByRole('button', { name: /^remove$/i })
        .click();
      await expect(page.getByText('AI grammar issues: 1')).toBeVisible();
      await expect
        .poll(() => grammarSaveRequestCount)
        .toBeGreaterThanOrEqual(1);

      pendingGrammarSaves.splice(0).forEach((release) => release());
      await expect.poll(() => grammarSaveRequestCount).toBe(2);
      pendingGrammarSaves.splice(0).forEach((release) => release());
      await expect
        .poll(async () => {
          const saved = await prisma.submission.findUniqueOrThrow({
            where: { id: e2eContext.submittedSubmissionId },
            select: { grammarIssues: true },
          });
          if (Array.isArray(saved.grammarIssues)) {
            return saved.grammarIssues.length;
          }
          const savedPayload = saved.grammarIssues as {
            issues?: unknown[];
          } | null;
          return savedPayload?.issues?.length;
        })
        .toBe(1);

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('button', { name: /Grammar\/Syntax\/Formatting/i })
        .click();
      await expect(page.getByText('AI grammar issues: 1')).toBeVisible();
      await expect(
        page.getByText('Grammar issue that should remain.')
      ).toBeVisible();
    } finally {
      pendingGrammarSaves.splice(0).forEach((release) => release());
      await prisma.submission.update({
        where: { id: e2eContext.submittedSubmissionId },
        data: { grammarIssues: { issues: [] } },
      });
      await prisma.$disconnect();
    }
  });
});
