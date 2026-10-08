/**
 * QA screenshots for handle + password flows (not part of smoke).
 * Run from services/web-app:
 *   QA_SCREENSHOT_DIR=../../qa/handle-password-screens bunx playwright test e2e/tests/auth.free-tier-handle-join.qa-screens.spec.ts --project=chromium
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { generateStudentJoinToken } from '../../app/utils/student-join-token';
import { FREE_CLASSROOM_STUDENT_SEAT_CAP } from '../../app/domain/free-tier/class-seat-cap';
import { FREE_CLASS_CLASS_FULL_MESSAGE } from '../../app/domain/free-tier/class-seat-cap';
import bcrypt from 'bcryptjs';

const OUT =
  process.env.QA_SCREENSHOT_DIR?.trim() ||
  join(import.meta.dir, '../../../..', 'qa', 'handle-password-screens');

async function shot(page: import('@playwright/test').Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

test.describe('QA screenshots — free-tier handle flows', () => {
  test('capture handle signup, login, errors, and seat cap', async ({
    page,
    e2eContext: _e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const run = Date.now().toString(36);
    const handle = `qahandle${run}`.slice(0, 20);
    const password = 'yawp-test-pass-1';
    const joinToken = generateStudentJoinToken();

    const org = await prisma.organization.create({
      data: {
        name: `QA Free Tier ${Date.now()}`,
        plan: 'FREE_CLASSROOM',
        numOfStudentSeats: FREE_CLASSROOM_STUDENT_SEAT_CAP,
      },
    });
    const school = await prisma.school.create({
      data: {
        name: 'QA School',
        code: `QA-${run}`,
        organizationId: org.id,
      },
    });
    const teacherEmail = `qa-teacher-${run}@example.com`;
    const teacherUser = await prisma.user.create({
      data: {
        email: teacherEmail,
        name: 'QA Teacher',
        password: {
          create: { hash: await bcrypt.hash('yawp-dev', 10) },
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
    const klass = await prisma.class.create({
      data: {
        code: `QA${run}`.slice(0, 8).toUpperCase(),
        studentJoinToken: joinToken,
        schoolId: school.id,
        schoolYear: '2025-2026',
        teachers: { connect: { id: teacherMembership.id } },
      },
    });

    const joinUrl = `/join?t=${joinToken}`;

    try {
      await page.goto(joinUrl);
      await shot(page, '05-join-handle-form.png');
      await page.getByLabel('Display name').fill('QA Handle Student');
      await page.getByLabel('Handle').fill(handle);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Join class' }).click();
      await expect(page).toHaveURL(/\/app/);
      await shot(page, '05-student-handle-signup-complete.png');

      await page.goto('/auth/logout');
      await page.goto('/auth/login');
      await page.getByLabel('Email or handle').fill(handle);
      await page.getByLabel('Password').fill('wrong-password-99');
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.waitForTimeout(800);
      await shot(page, '07-wrong-password-login.png');

      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/app/);
      await shot(page, '08-handle-student-login.png');

      await page.goto('/auth/logout');
      await page.goto(joinUrl);
      await page.getByLabel('Display name').fill('Duplicate');
      await page.getByLabel('Handle').fill(handle);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Join class' }).click();
      await page.waitForTimeout(800);
      await shot(page, '06-duplicate-handle-rejected.png');

      const fullClass = await prisma.class.create({
        data: {
          code: `FULL${run}`.slice(0, 8).toUpperCase(),
          studentJoinToken: generateStudentJoinToken(),
          schoolId: school.id,
          schoolYear: '2025-2026',
          teachers: { connect: { id: teacherMembership.id } },
        },
      });
      const studentUsers = [];
      for (let i = 0; i < FREE_CLASSROOM_STUDENT_SEAT_CAP; i += 1) {
        const u = await prisma.user.create({
          data: {
            email: null,
            username: `fill${run}${i}`.slice(0, 20),
            name: `Fill ${i}`,
            password: { create: { hash: await bcrypt.hash(password, 10) } },
            memberships: {
              create: {
                organizationId: org.id,
                role: 'STUDENT',
                classes: { connect: { id: fullClass.id } },
              },
            },
          },
        });
        studentUsers.push(u.id);
      }

      const fullJoin = `/join?t=${fullClass.studentJoinToken}`;
      await page.goto(fullJoin);
      await page.getByLabel('Display name').fill('One Too Many');
      await page.getByLabel('Handle').fill(`over${run}`.slice(0, 20));
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Join class' }).click();
      await expect(page.getByText(FREE_CLASS_CLASS_FULL_MESSAGE)).toBeVisible({
        timeout: 15000,
      });
      await shot(page, '12-class-full-seat-cap.png');
    } finally {
      await prisma.class.deleteMany({ where: { schoolId: school.id } }).catch(() => {});
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
