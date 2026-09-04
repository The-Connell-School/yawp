import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { invalidateUserSessions } from '../db-helpers';

const TEST_USER = {
  email: 'jdoe@brock.software',
  password: 'johndoe',
};

test.describe('Authentication - real sign in', () => {
  test('signs in via login form and reaches /app', async ({ page, signIn }) => {
    await signIn(TEST_USER.email, TEST_USER.password);
    await expect(page.getByTestId('app._index')).toBeVisible();
  });

  test('student with no classes can log out and return to login', async ({
    page,
  }) => {
    const prisma = createE2EPrismaClient();
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USER.email },
      select: {
        id: true,
        memberships: {
          where: { role: 'STUDENT' },
          take: 1,
          select: {
            id: true,
            classesAsStudent: { select: { id: true } },
          },
        },
      },
    });
    const membership = student.memberships[0];

    if (!membership) {
      throw new Error('Seeded student membership is missing');
    }

    try {
      await invalidateUserSessions({ prisma, userId: student.id });
      await prisma.orgMembership.update({
        where: { id: membership.id },
        data: { classesAsStudent: { set: [] } },
      });

      await page.goto('/auth/login');
      await page.locator('input[type="email"]').fill(TEST_USER.email);
      await page.locator('input[type="password"]').fill(TEST_USER.password);
      await page.getByRole('button', { name: /log in/i }).click();

      await expect(page).toHaveURL(/\/app\/?$/);
      const classCodeDialog = page.getByRole('dialog');
      await expect(classCodeDialog).toBeVisible();
      await expect(
        classCodeDialog.getByRole('button', { name: 'Sign out' })
      ).toBeVisible();

      await classCodeDialog.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/auth\/login$/);
    } finally {
      await prisma.orgMembership.update({
        where: { id: membership.id },
        data: {
          classesAsStudent: {
            set: membership.classesAsStudent.map(({ id }) => ({ id })),
          },
        },
      });
      await invalidateUserSessions({ prisma, userId: student.id });
      await prisma.$disconnect();
    }
  });
});
