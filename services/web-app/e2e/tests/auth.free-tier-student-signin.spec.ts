import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { expect, loadE2eEnvFromFile, test } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { generateStudentJoinToken } from '../../app/utils/student-join-token';

const PASSWORD = 'yawp-test-pass-1';
const WRONG_PASSWORD = 'yawp-wrong-pass-1';
const SCREENSHOT_DIR =
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  join(import.meta.dir, '../../../..', 'qa', 'student-signin');
const LOCAL_BASE_URL = `http://127.0.0.1:${process.env.FREE_TIER_E2E_PORT || 5197}`;

async function shot(page: import('@playwright/test').Page, name: string) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOT_DIR, name), fullPage: true });
}

async function logout(
  page: import('@playwright/test').Page,
  _baseUrl = LOCAL_BASE_URL
) {
  await page.context().clearCookies();
}

async function seedReleasedFreeTierClassroom(run: string) {
  loadE2eEnvFromFile();
  const prisma = createE2EPrismaClient();
  const org = await prisma.organization.create({
    data: {
      name: `QA Student Signin Org ${run}`,
      plan: 'FREE_CLASSROOM',
      planActivatedAt: new Date(),
    },
  });
  const app = await prisma.freeTierApplication.create({
    data: {
      email: `qa-student-signin-teacher-${run}@example.com`,
      name: 'QA Released Teacher',
      schoolName: `QA Released Demo ${run}`,
      location: 'E2E',
      gradeLevel: '9',
      status: 'APPROVED',
      releasedAt: new Date(),
      organizationId: org.id,
    },
  });
  const school = await prisma.school.create({
    data: {
      name: `QA Demo ${run}`,
      code: `QASIGNIN-${run}`.slice(0, 24).toUpperCase(),
      organizationId: org.id,
    },
  });
  const teacherUser = await prisma.user.create({
    data: {
      email: `qa-student-signin-teacher-user-${run}@example.com`,
      name: 'QA Signin Teacher',
      password: { create: { hash: await bcrypt.hash(PASSWORD, 10) } },
    },
  });
  const teacherMembership = await prisma.orgMembership.create({
    data: {
      userId: teacherUser.id,
      organizationId: org.id,
      role: 'TEACHER',
    },
  });
  const firstJoinToken = generateStudentJoinToken();
  const secondJoinToken = generateStudentJoinToken();
  const firstClass = await prisma.class.create({
    data: {
      code: `QS1-${run}`.slice(0, 18).toUpperCase(),
      studentJoinToken: firstJoinToken,
      schoolId: school.id,
      schoolYear: '2026-2027',
      grade: '9',
      period: '1',
      teachers: { connect: { id: teacherMembership.id } },
    },
  });
  const secondClass = await prisma.class.create({
    data: {
      code: `QS2-${run}`.slice(0, 18).toUpperCase(),
      studentJoinToken: secondJoinToken,
      schoolId: school.id,
      schoolYear: '2026-2027',
      grade: '9',
      period: '2',
      teachers: { connect: { id: teacherMembership.id } },
    },
  });

  return {
    prisma,
    org,
    app,
    school,
    teacherUser,
    firstClass,
    secondClass,
    firstJoinToken,
    secondJoinToken,
  };
}

test.describe('Free-tier student handle sign-in', () => {
  test('released free-tier classroom accepts one handle, signs in, and rejects password/reuse', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const run = Date.now().toString(36);
    const handle = `qastudentsign${run}`.slice(0, 30);
    const displayName = 'QA Handle Student';
    const fixture = await seedReleasedFreeTierClassroom(run);
    const { prisma, org, app, school, teacherUser, firstClass, secondClass } =
      fixture;

    try {
      await page.goto(`/join?t=${fixture.firstJoinToken}`);
      await expect(
        page.getByRole('heading', { name: 'Create your student account' })
      ).toBeVisible();
      await shot(page, '01-join-setup-before-submit.png');

      await page.getByLabel('Display name').fill(displayName);
      await page.getByLabel('Handle').fill(handle);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByLabel('Confirm password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Join class' }).click();
      await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });

      await page.goto(`/app/my-classes/${firstClass.id}`);
      await expect(page.getByTestId('student-class-detail')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(school.name)).toBeVisible();
      await shot(page, '02-authenticated-student-surface.png');

      const student = await prisma.user.findUnique({
        where: { username: handle },
        select: {
          id: true,
          email: true,
          username: true,
          memberships: {
            select: {
              id: true,
              role: true,
              organizationId: true,
              classesAsStudent: { select: { id: true } },
            },
          },
        },
      });
      expect(student?.email).toBeNull();
      expect(student?.memberships).toHaveLength(1);
      expect(student?.memberships[0]?.role).toBe('STUDENT');
      expect(student?.memberships[0]?.organizationId).toBe(org.id);
      expect(
        student?.memberships[0]?.classesAsStudent.map((c) => c.id)
      ).toEqual([firstClass.id]);

      const tiedApplication = await prisma.freeTierApplication.findUnique({
        where: { id: app.id },
        select: { status: true, releasedAt: true, organizationId: true },
      });
      expect(tiedApplication).toMatchObject({
        status: 'APPROVED',
        organizationId: org.id,
      });
      expect(tiedApplication?.releasedAt).toBeTruthy();

      await logout(page);
      await page.goto('/auth/login');
      await page.getByLabel('Email or handle').fill(handle);
      await page.getByLabel('Password').fill(WRONG_PASSWORD);
      await page.getByRole('button', { name: /log in/i }).click();
      await expect(page.getByText('Invalid email or password')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/auth\/login/);
      await shot(page, '03-wrong-password-denied.png');

      await page.getByLabel('Email or handle').fill(handle);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /log in/i }).click();
      await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
      await page.goto(`/app/my-classes/${firstClass.id}`);
      await expect(page.getByTestId('student-class-detail')).toBeVisible();

      await logout(page);
      await page.goto(`/join?t=${fixture.secondJoinToken}`);
      await page.getByLabel('Display name').fill('QA Duplicate Student');
      await page.getByLabel('Handle').fill(handle);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByLabel('Confirm password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Join class' }).click();
      await expect(page.getByText(/This handle is already taken/i)).toBeVisible(
        {
          timeout: 15_000,
        }
      );
      await shot(page, '04-duplicate-handle-rejected.png');

      const usersWithHandle = await prisma.user.findMany({
        where: { username: handle },
        select: {
          id: true,
          memberships: {
            select: {
              organizationId: true,
              classesAsStudent: { select: { id: true } },
            },
          },
        },
      });
      expect(usersWithHandle).toHaveLength(1);
      expect(usersWithHandle[0]?.memberships).toHaveLength(1);
      expect(
        usersWithHandle[0]?.memberships[0]?.classesAsStudent.map((c) => c.id)
      ).toEqual([firstClass.id]);
      expect(
        usersWithHandle[0]?.memberships[0]?.classesAsStudent.some(
          (c) => c.id === secondClass.id
        )
      ).toBe(false);
    } finally {
      const student = await prisma.user.findFirst({
        where: { username: handle },
        select: { id: true },
      });
      if (student) {
        await prisma.session.deleteMany({ where: { userId: student.id } });
        await prisma.orgMembership.deleteMany({
          where: { userId: student.id },
        });
        await prisma.user.delete({ where: { id: student.id } }).catch(() => {});
      }
      await prisma.class
        .deleteMany({ where: { schoolId: school.id } })
        .catch(() => {});
      await prisma.orgMembership
        .deleteMany({ where: { organizationId: org.id } })
        .catch(() => {});
      await prisma.school.delete({ where: { id: school.id } }).catch(() => {});
      await prisma.freeTierApplication
        .delete({ where: { id: app.id } })
        .catch(() => {});
      await prisma.organization
        .delete({ where: { id: org.id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { id: teacherUser.id } })
        .catch(() => {});
    }
  });

  test('hosted demo disposable fixture guard', async ({ page }) => {
    const required = [
      'QA_DEMO_BASE_URL',
      'QA_DEMO_STUDENT_JOIN_TOKEN_ONE',
      'QA_DEMO_STUDENT_JOIN_TOKEN_TWO',
    ] as const;
    const mutationOptIn = 'QA_DEMO_STUDENT_SIGNIN_ALLOW_MUTATION';
    const missing = required.filter((key) => !process.env[key]?.trim());
    const allowMutation = process.env[mutationOptIn] === 'true';
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    if (missing.length || !allowMutation) {
      await writeFile(
        join(SCREENSHOT_DIR, 'student-signin-hosted-demo-skip.txt'),
        [
          'Hosted demo run skipped.',
          missing.length
            ? `Missing disposable demo fixture env: ${missing.join(', ')}`
            : 'Disposable demo fixture env is present.',
          !allowMutation
            ? `Missing explicit mutation opt-in: ${mutationOptIn}=true`
            : 'Mutation opt-in is present.',
          `Required env: QA_DEMO_BASE_URL, QA_DEMO_STUDENT_JOIN_TOKEN_ONE, QA_DEMO_STUDENT_JOIN_TOKEN_TWO, ${mutationOptIn}=true.`,
        ].join('\n')
      );
      test.skip(
        true,
        'Hosted demo disposable fixture env and mutation opt-in are not configured.'
      );
    }

    const baseUrl = process.env.QA_DEMO_BASE_URL!.replace(/\/+$/, '');
    const firstToken = process.env.QA_DEMO_STUDENT_JOIN_TOKEN_ONE!;
    const secondToken = process.env.QA_DEMO_STUDENT_JOIN_TOKEN_TWO!;
    const run = Date.now().toString(36);
    const handle = `qademostudent${run}`.slice(0, 30);

    await page.goto(`${baseUrl}/join?t=${encodeURIComponent(firstToken)}`);
    await shot(page, 'demo-01-join-setup-before-submit.png');
    await page.getByLabel('Display name').fill('QA Demo Student');
    await page.getByLabel('Handle').fill(handle);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Join class' }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
    await shot(page, 'demo-02-authenticated-student-surface.png');

    await logout(page, baseUrl);
    await page.goto(`${baseUrl}/auth/login`);
    await page.getByLabel('Email or handle').fill(handle);
    await page.getByLabel('Password').fill(WRONG_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, 'demo-03-wrong-password-denied.png');

    await page.getByLabel('Email or handle').fill(handle);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    await logout(page, baseUrl);
    await page.goto(`${baseUrl}/join?t=${encodeURIComponent(secondToken)}`);
    await page.getByLabel('Display name').fill('QA Demo Duplicate');
    await page.getByLabel('Handle').fill(handle);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Join class' }).click();
    await expect(page.getByText(/This handle is already taken/i)).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, 'demo-04-duplicate-handle-rejected.png');
  });
});
