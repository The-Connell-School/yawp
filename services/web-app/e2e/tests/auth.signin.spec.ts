import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { invalidateUserSessions } from '../db-helpers';

const TEST_USER = {
  email: 'jdoe@brock.software',
  password: 'johndoe',
};

test.describe('Authentication - real sign in', () => {
  for (const origin of ['http://127.0.0.1:5173', 'http://ua.localhost:5173']) {
    test(`waits for login hydration before accepting credentials on ${origin}`, async ({
      page,
      e2eContext,
    }) => {
      let releaseHydration!: () => void;
      const hydration = new Promise<void>((resolve) => {
        releaseHydration = resolve;
      });
      await page.route('**/*entry.client.tsx*', async (route) => {
        await hydration;
        await route.continue();
      });
      try {
        await page.goto(`${origin}/auth/login`, { waitUntil: 'commit' });
        const email = page.getByLabel('Email or handle');
        const password = page.getByLabel('Password');
        const submit = page.getByRole('button', { name: 'Log in', exact: true });
        await expect(email).toBeVisible();
        await expect(email).toBeDisabled();
        await expect(password).toBeDisabled();
        await expect(submit).toBeDisabled();

        releaseHydration();
        const account = origin.includes('ua.localhost')
          ? e2eContext.ua.teacher
          : TEST_USER;
        await email.fill(account.email);
        await password.fill(account.password);
        await submit.click();
        await expect(page).toHaveURL(`${origin}/app`);
        await expect(page.getByTestId('app._index')).toBeVisible();
      } finally {
        releaseHydration();
      }
    });
  }

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
      await page.getByLabel('Email or handle').fill(TEST_USER.email);
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
