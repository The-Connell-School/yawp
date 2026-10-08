import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  createDeployedAssignment,
  ensureDocumentUnsubmitted,
} from '../db-helpers';
import { generateStudentJoinToken } from '../../app/utils/student-join-token';
import bcrypt from 'bcryptjs';

test.describe('Free-tier handle student', () => {
  // Smoke: join link → submit → teacher reset → temp login → password change → re-login
  test('join link flow: write, submit, grading queue, password reset', async ({
    page,
    browser,
    helpers,
    e2eContext: _e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const handle = `e2ehandle${Date.now()}`.slice(0, 20);
    const password = 'yawp-test-pass-1';
    const newPassword = 'yawp-test-pass-2';
    const tempPassword = 'temp-reset-1';
    const displayName = 'E2E Handle Student';
    const promptMarker = `Free tier prompt ${Date.now()}`;

    const org = await prisma.organization.create({
      data: {
        name: `Free Tier E2E ${Date.now()}`,
        plan: 'FREE_CLASSROOM',
      },
    });
    const assignmentType = await prisma.assignmentType.create({
      data: {
        title: 'Free Tier E2E Writing',
        position: 1,
        ownerOrgId: org.id,
        organizationAssignments: { create: { organizationId: org.id } },
        assignmentModules: {
          create: [
            {
              title: 'Writing',
              position: 1,
              instructions: {
                create: [
                  {
                    title: 'Draft',
                    prompt: 'Write your paragraph.',
                    position: 1,
                    showChatButton: true,
                  },
                ],
              },
            },
          ],
        },
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
    const joinToken = generateStudentJoinToken();
    const klass = await prisma.class.create({
      data: {
        code: `FREE-${Date.now().toString(36).slice(-6).toUpperCase()}`,
        studentJoinToken: joinToken,
        schoolId: school.id,
        schoolYear: '2025-2026',
        grade: '9',
        period: '1',
        teachers: { connect: { id: teacherMembership.id } },
      },
    });
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: klass.id,
      assignmentTypeId: assignmentType.id,
      title: 'Free tier writing',
      prompt: `${promptMarker}: Write a short paragraph.`,
      submitForGrade: true,
      tutorEnabled: false,
    });

    try {
      await page.goto(`/join?t=${joinToken}`);
      await page.getByLabel('Display name').fill(displayName);
      await page.getByLabel('Handle').fill(handle);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByRole('button', { name: 'Join class' }).click();
      await expect(page).toHaveURL(/\/app/);

      await page.goto(`/app/my-classes/${klass.id}`);
      await expect(page.getByTestId('student-class-detail')).toBeVisible();
      const startButton = page.locator(
        `form[action="/app/class-assignments/${classAssignment.id}/start"] button`
      );
      await expect(startButton).toBeVisible({ timeout: 15000 });
      await startButton.click();
      await page.waitForURL('**/app/documents/**', { timeout: 30000 });

      await helpers.waitForEditorReady();
      await helpers.typeInEditor('Handle student draft for grading.');
      await helpers.waitForSaved();
      await page.getByTestId('document-submit-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('document-finalize-submit').click();
      await expect(page.getByText('Submitted').first()).toBeVisible({
        timeout: 15000,
      });

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
      await expect(teacherPage.getByText('Student join link')).toBeVisible();

      await teacherPage.goto(`/app/my-classes/${klass.id}?tab=documents`);
      await expect(teacherPage.getByText(displayName)).toBeVisible({
        timeout: 15000,
      });

      await teacherPage.goto(`/app/my-classes/${klass.id}?tab=students`);
      await teacherPage.locator('input[name="temporaryPassword"]').fill(tempPassword);
      await teacherPage.getByRole('button', { name: 'Reset login' }).click();
      await teacherContext.close();

      await page.goto('/auth/logout');
      await page.goto('/auth/login');
      await page.getByLabel('Email or handle').fill(handle);
      await page.getByLabel('Password').fill(tempPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/required-password-change/, {
        timeout: 15000,
      });
      await page.getByLabel('New password', { exact: true }).fill(newPassword);
      await page.getByLabel('Confirm new password').fill(newPassword);
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await expect(page).toHaveURL(/\/app/);

      await page.goto('/auth/logout');
      await page.goto('/auth/login');
      await page.getByLabel('Email or handle').fill(handle);
      await page.getByLabel('Password').fill(newPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/app/);
    } finally {
      const student = await prisma.user.findFirst({
        where: { username: handle },
        select: {
          id: true,
          memberships: { where: { organizationId: org.id }, select: { id: true } },
        },
      });
      const studentMembershipId = student?.memberships[0]?.id;
      if (student && studentMembershipId) {
        const documents = await prisma.document.findMany({
          where: { membershipId: studentMembershipId },
          select: { id: true },
        });
        for (const doc of documents) {
          await ensureDocumentUnsubmitted({ prisma, documentId: doc.id });
          await prisma.documentComment
            .deleteMany({ where: { documentId: doc.id } })
            .catch(() => {});
        }
        await prisma.document.deleteMany({ where: { membershipId: studentMembershipId } });
        await prisma.session.deleteMany({ where: { userId: student.id } });
        await prisma.password.deleteMany({ where: { userId: student.id } }).catch(() => {});
        await prisma.orgMembership.deleteMany({ where: { userId: student.id } });
        await prisma.user.delete({ where: { id: student.id } }).catch(() => {});
      }
      await prisma.classAssignment
        .deleteMany({ where: { classId: klass.id } })
        .catch(() => {});
      await prisma.assignment.delete({ where: { id: assignment.id } }).catch(() => {});
      await prisma.class.delete({ where: { id: klass.id } }).catch(() => {});
      await prisma.orgMembership
        .deleteMany({ where: { organizationId: org.id } })
        .catch(() => {});
      await prisma.school.delete({ where: { id: school.id } }).catch(() => {});
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: teacherUser.id } }).catch(() => {});
    }
  });
});
