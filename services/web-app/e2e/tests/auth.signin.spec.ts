import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { invalidateUserSessions } from '../db-helpers';
import { submitUnifiedLogin } from '../helpers/unified-login';

const TEST_USER = {
  email: 'jdoe@brock.software',
  password: 'johndoe',
};

test.describe('Authentication - real sign in', () => {
  for (const origin of ['http://127.0.0.1:5173', 'http://ua.localhost:5173']) {
    test(`preserves credentials entered before login hydration on ${origin}`, async ({
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
        const identifier = page.getByLabel('Email or class code', {
          exact: true,
        });
        await expect(identifier).toBeVisible();
        await expect(identifier).toBeEnabled();
        const account = origin.includes('ua.localhost')
          ? e2eContext.ua.teacher
          : TEST_USER;
        await identifier.fill(account.email);
        await expect(identifier).toHaveValue(account.email);

        releaseHydration();
        await page.waitForLoadState('networkidle');
        await expect(identifier).toHaveValue(account.email);

        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        const password = page.getByLabel('Password', { exact: true });
        await password.fill(account.password);
        await expect(password).toHaveValue(account.password);
        const submission = page.waitForRequest(
          (request) =>
            request.method() === 'POST' &&
            new URL(request.url()).pathname === '/auth/login.data'
        );
        await page.getByRole('button', { name: 'Log In', exact: true }).click();
        await submission;
        await expect(page).toHaveURL(`${origin}/app`);
        await expect(page.getByTestId('app._index')).toBeVisible();
      } finally {
        releaseHydration();
      }
    });

    test.skip(`signs in natively without JavaScript on ${origin}`, async () => {
      // Unified sign-on resolve requires client-side navigation; legacy one-page login was removed.
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
      await submitUnifiedLogin(page, TEST_USER.email, TEST_USER.password);

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
