import { expect, test } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';

const prisma = createE2EPrismaClient();

test.describe('Free classroom bundle quotas', () => {
  test('teacher sees assignment type counters in the creation sheet', async ({
    page,
  }) => {
    const email =
      process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ??
      'dev.teacher.free@yawp.local';
    const login = await page.request.post('/auth/dev-login', {
      form: { email },
      maxRedirects: 0,
    });
    expect(login.ok()).toBe(true);
    await page.goto('/app');
    await page.getByRole('button', { name: /create assignment/i }).click();
    await expect(page.getByText(/of 12 Class Starters left/i)).toBeVisible();
    const types = await prisma.assignmentType.findMany({
      where: {
        kind: { in: ['class_starter', 'prewriting', 'thesis_statement'] },
      },
      select: { id: true },
    });
    expect(types.length).toBe(3);
  });
});
