import { expect, test } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';

const prisma = createE2EPrismaClient();

/**
 * Requires a FREE_CLASSROOM org fixture with bundle assignment types linked.
 * Skips when the preview database has not been seeded for free tier QA.
 */
test.describe('Free classroom bundle quotas', () => {
  test.skip(
    !process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL,
    'Set E2E_FREE_CLASSROOM_TEACHER_EMAIL for free-tier bundle E2E'
  );

  test('teacher sees assignment type counters in the creation sheet', async ({
    page,
  }) => {
    const email = process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL!;
    await page.goto(`/auth/dev-login?email=${encodeURIComponent(email)}`);
    await page.goto('/app');
    await page.getByRole('button', { name: /create assignment/i }).click();
    await expect(page.getByText(/of 12 Class Starters left/i)).toBeVisible();
    const types = await prisma.assignmentType.findMany({
      where: { kind: { in: ['class_starter', 'prewriting', 'thesis_statement'] } },
      select: { id: true },
    });
    expect(types.length).toBe(3);
  });
});
