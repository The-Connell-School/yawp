import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import bcrypt from 'bcryptjs';

test.describe('Free-tier handle student', () => {
  test('joins via class code, logs in, writes, teacher sees roster', async ({
    page,
    browser,
  }) => {
    const prisma = createE2EPrismaClient();
    const handle = `e2ehandle${Date.now()}`.slice(0, 20);
    const password = 'yawp-test-pass-1';
    const displayName = 'E2E Handle Student';

    const org = await prisma.organization.create({
      data: {
        name: `Free Tier E2E ${Date.now()}`,
        plan: 'FREE_CLASSROOM',
      },
    });
    const school = await prisma.school.create({
      data: {
        name: 'Free E2E School',
        code: `FE2E-${Date.now()}`,
        organizationId: org.id,
      },
    });
    const teacherEmail = `free-teacher-${Date.now()}@example.com`;
    const teacherPassword = 'yawp-dev';
    const teacherUser = await prisma.user.create({
      data: {
        email: teacherEmail,
        name: 'Free Tier Teacher',
        password: {
          create: { hash: await bcrypt.hash(teacherPassword, 10) },
        },
      },
    });
    const teacherMembership = await prisma.orgMembership.create({
      data: {
        userId: teacherUser.id,
        organizationId: org.id,
        role: 'TEACHER',
      },
    });
    const classCode = `FREE-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const klass = await prisma.class.create({
      data: {
        code: classCode,
        schoolId: school.id,
        schoolYear: '2025-2026',
        grade: '9',
        period: '1',
        teachers: { connect: { id: teacherMembership.id } },
      },
    });

    try {
      await page.goto(`/join?code=${classCode}`);
      await page.getByLabel('Display name').fill(displayName);
      await page.getByLabel('Handle').fill(handle);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Join class' }).click();
      await expect(page).toHaveURL(/\/app/);

      await page.goto('/auth/logout');
      await page.goto('/auth/login');
      await page.getByLabel('Email or handle').fill(handle);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/app/);

      const teacherContext = await browser.newContext();
      const teacherPage = await teacherContext.newPage();
      await teacherPage.goto('/auth/login');
      await teacherPage.getByLabel('Email or handle').fill(teacherEmail);
      await teacherPage.getByLabel('Password').fill(teacherPassword);
      await teacherPage.getByRole('button', { name: 'Log in' }).click();
      await expect(teacherPage).toHaveURL(/\/app/);
      await teacherPage.goto(`/app/my-classes/${klass.id}?tab=students`);
      await expect(teacherPage.getByText(displayName)).toBeVisible();
      await expect(teacherPage.getByText(`@${handle}`)).toBeVisible();
      await teacherContext.close();
    } finally {
      await prisma.class.delete({ where: { id: klass.id } }).catch(() => {});
      await prisma.orgMembership.deleteMany({ where: { organizationId: org.id } });
      await prisma.school.delete({ where: { id: school.id } }).catch(() => {});
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: teacherUser.id } }).catch(() => {});
      const student = await prisma.user.findFirst({ where: { username: handle } });
      if (student) {
        await prisma.session.deleteMany({ where: { userId: student.id } });
        await prisma.user.delete({ where: { id: student.id } });
      }
    }
  });
});
