import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import bcrypt from 'bcryptjs';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

test.use({
  video: process.env.QA_CAPTURE_DIR ? 'on' : 'retain-on-failure',
});

async function captureCheckpoint(page: Page, name: string) {
  const captureDir = process.env.QA_CAPTURE_DIR;
  if (!captureDir) return;
  await mkdir(captureDir, { recursive: true });
  await page.waitForTimeout(750);
  await page.screenshot({
    path: path.join(captureDir, `${name}.png`),
    fullPage: true,
  });
  await page.waitForTimeout(750);
}

async function lingerForQa(page: Page, milliseconds: number) {
  if (process.env.QA_CAPTURE_DIR) {
    await page.waitForTimeout(milliseconds);
  }
}

async function signInPage(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/app'), {
    timeout: 15000,
  });
}

test.describe('Released grade editing and submission activity', () => {
  test('records the teacher edit and never exposes activity to the student', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const document = await prisma.document.create({
      data: {
        title: `Released grade audit ${Date.now()}`,
        text: 'A dedicated released submission for audit testing.',
        html: '<p>A dedicated released submission for audit testing.</p>',
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        assignmentId: e2eContext.assignmentId,
        classAssignmentId: e2eContext.classAssignmentId,
      },
      select: { id: true, title: true, text: true, html: true },
    });
    const releasedAt = new Date('2026-08-20T12:00:00.000Z');
    const submission = await prisma.submission.create({
      data: {
        // The database immutability guard permits cleanup only for this
        // unmistakably disposable E2E namespace and the production QA fixture.
        id: `e2e-released-grade-audit-${Date.now()}`,
        documentId: document.id,
        title: document.title,
        text: document.text ?? '',
        html: document.html ?? '',
        submittedAt: new Date('2026-08-19T12:00:00.000Z'),
        gradedAt: new Date('2026-08-20T11:00:00.000Z'),
        gradedByMembershipId: e2eContext.teacherMembershipId,
        numericPercentage: 77,
        letterGrade: 'C+',
        score: '77% (C+)',
        overallScore: 4,
        overallComment: 'Good effort with room for improvement.',
        rubricScores: {
          thesis_and_content: 5,
          organization_and_structure: 1,
          evidence_and_support: 5,
          voice_and_style: 1,
          grammar_and_mechanics: 1,
        },
        releasedAt,
      },
      select: { id: true },
    });
    const original = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
      select: {
        releasedAt: true,
        numericPercentage: true,
        letterGrade: true,
        overallComment: true,
        gradedAt: true,
        gradedByMembershipId: true,
        score: true,
        rubricScores: true,
        grammarIssues: true,
      },
    });

    try {
      expect(original.releasedAt).not.toBeNull();
      await expect(
        prisma.submissionActivity.count({
          where: { submissionId: submission.id },
        })
      ).resolves.toBe(0);

      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/submissions/${submission.id}`);
      await page.waitForLoadState('networkidle');

      const panel = page.getByTestId('submission-lifecycle-panel');
      await expect(
        panel.getByTestId('grade-summary-released-label')
      ).toHaveText('Released');
      await expect(
        page.getByTestId('submission-activity-trigger')
      ).toBeVisible();
      await captureCheckpoint(page, '01-released-grade');
      await lingerForQa(page, 3500);

      await panel.getByTestId('submission-lifecycle-edit').click();
      await expect(
        page.getByTestId('released-grade-edit-warning')
      ).toBeVisible();
      await expect(page.getByTestId('grading-assistant-generate')).toHaveCount(
        0
      );
      await captureCheckpoint(page, '02-edit-warning');
      await lingerForQa(page, 4500);

      const saveButton = panel.getByTestId('submission-lifecycle-save');
      await expect(saveButton).toBeDisabled();
      await page.getByTestId('grading-overall-percentage').fill('92');
      await page
        .getByTestId('grading-overall-comment')
        .fill('Excellent revision after release.');
      await expect(saveButton).toBeEnabled();
      await lingerForQa(page, 3000);
      await saveButton.click();
      await expect(page.getByTestId('released-grade-edit-warning')).toHaveCount(
        0,
        {
          timeout: 15000,
        }
      );

      // Explicit route revalidation should expose the audit event immediately;
      // a manual reload must not be required to trust Activity.
      await page.getByTestId('submission-activity-trigger').click();
      const liveActivityList = page.getByTestId('submission-activity-list');
      await expect(
        liveActivityList.getByText('Grade or feedback changed')
      ).toBeVisible({ timeout: 15000 });
      await captureCheckpoint(page, '03-live-activity');
      await lingerForQa(page, 5000);
      await page.keyboard.press('Escape');

      const persisted = await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
        select: {
          releasedAt: true,
          numericPercentage: true,
          overallComment: true,
          score: true,
          rubricScores: true,
          grammarIssues: true,
        },
      });
      expect(persisted.releasedAt?.toISOString()).toBe(
        original.releasedAt?.toISOString()
      );
      expect(persisted.numericPercentage).toBe(92);
      expect(persisted.overallComment).toBe(
        'Excellent revision after release.'
      );
      expect(persisted.rubricScores).toEqual(original.rubricScores);
      expect(persisted.grammarIssues).toEqual(original.grammarIssues);

      const activities = await prisma.submissionActivity.findMany({
        where: { submissionId: submission.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        organizationId: e2eContext.organizationId,
        actorMembershipId: e2eContext.teacherMembershipId,
        actorType: 'human',
        actorName: e2eContext.teacherName,
        eventType: 'submission.grade_updated',
        source: 'update-submission',
        occurredAfterRelease: true,
        changes: {
          numericPercentage: {
            before: original.numericPercentage,
            after: 92,
          },
          overallComment: {
            before: original.overallComment,
            after: 'Excellent revision after release.',
          },
        },
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(panel.getByText('92 / 100', { exact: true }).first()).toBeVisible();
      await expect(
        panel.getByText('Excellent revision after release.')
      ).toBeVisible();
      await page.getByTestId('submission-activity-trigger').click();
      const activityList = page.getByTestId('submission-activity-list');
      await expect(
        activityList.getByText('Grade or feedback changed')
      ).toBeVisible();
      await expect(
        activityList.getByText(e2eContext.teacherName)
      ).toBeVisible();
      await expect(
        activityList.getByText('After release', { exact: true })
      ).toBeVisible();
      await expect(activityList.getByText('77', { exact: true })).toBeVisible();
      await expect(activityList.getByText('92', { exact: true })).toBeVisible();
      await lingerForQa(page, 3500);

      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      const activityTrigger = page.getByTestId('submission-activity-trigger');
      await expect(activityTrigger).toBeVisible();
      const triggerBounds = await activityTrigger.boundingBox();
      expect(triggerBounds).not.toBeNull();
      expect(triggerBounds!.x).toBeGreaterThanOrEqual(0);
      expect(triggerBounds!.x + triggerBounds!.width).toBeLessThanOrEqual(390);
      await activityTrigger.click();
      const mobileActivityPanel = page.getByTestId('submission-activity-panel');
      await expect(mobileActivityPanel).toBeVisible();
      await expect
        .poll(async () => {
          const bounds = await mobileActivityPanel.boundingBox();
          return bounds == null ? null : bounds.x + bounds.width;
        })
        .toBeLessThanOrEqual(390);
      const panelBounds = await mobileActivityPanel.boundingBox();
      expect(panelBounds).not.toBeNull();
      expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
      expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(390);
      await captureCheckpoint(page, '04-mobile-activity');
      await lingerForQa(page, 4000);
      await page.keyboard.press('Escape');

      const createdComment = await page.evaluate(
        async ({ submissionId }) => {
          const form = new FormData();
          form.set('submissionId', submissionId);
          form.set('content', 'Post-release teacher note.');
          form.set('excerpt', 'dedicated released submission');
          form.set('occurrence', '1');
          const response = await fetch('/api/model/submission-comment', {
            method: 'POST',
            body: form,
          });
          return {
            status: response.status,
            body: (await response.json()) as {
              success?: boolean;
              comment?: { id: string };
            },
          };
        },
        { submissionId: submission.id }
      );
      expect(createdComment.status).toBe(201);
      expect(createdComment.body.comment?.id).toBeTruthy();
      const commentId = createdComment.body.comment!.id;

      const updatedComment = await page.evaluate(
        async ({ commentId }) => {
          const form = new FormData();
          form.set('content', 'Revised post-release teacher note.');
          const response = await fetch(
            `/api/model/submission-comment/${commentId}`,
            { method: 'POST', body: form }
          );
          return response.status;
        },
        { commentId }
      );
      expect(updatedComment).toBe(200);
      const deletedComment = await page.evaluate(
        async ({ commentId }) => {
          const response = await fetch(
            `/api/model/submission-comment/${commentId}`,
            { method: 'DELETE' }
          );
          return response.status;
        },
        { commentId }
      );
      expect(deletedComment).toBe(200);

      const commentActivities = await prisma.submissionActivity.findMany({
        where: {
          submissionId: submission.id,
          eventType: {
            in: [
              'submission.comment_created',
              'submission.comment_updated',
              'submission.comment_deleted',
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(commentActivities.map((activity) => activity.eventType)).toEqual([
        'submission.comment_created',
        'submission.comment_updated',
        'submission.comment_deleted',
      ]);
      expect(JSON.stringify(commentActivities[2]?.changes)).toContain(
        'Revised post-release teacher note.'
      );
      expect(
        commentActivities.every((activity) => activity.occurredAfterRelease)
      ).toBe(true);

      await page.context().clearCookies();
      await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
      await page.goto(`/app/submissions/${submission.id}?edit=1`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(`/app/submissions/${submission.id}`);
      await expect(page.getByText('92 / 100', { exact: true }).first()).toBeVisible();
      await expect(
        page.getByText('Excellent revision after release.')
      ).toBeVisible();
      await expect(page.getByTestId('submission-activity-trigger')).toHaveCount(
        0
      );
      await expect(page.getByTestId('submission-lifecycle-edit')).toHaveCount(
        0
      );
      await captureCheckpoint(page, '05-student-view');
      await lingerForQa(page, 5000);
    } finally {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "SET LOCAL yawp.submission_activity_cleanup = 'on'"
        );
        await tx.submissionActivity.deleteMany({
          where: { submissionId: submission.id },
        });
        await tx.submission.delete({ where: { id: submission.id } });
      });
      await prisma.document.delete({ where: { id: document.id } });
      await prisma.$disconnect();
    }
  });

  test('same-route revalidation cannot pair a stale grade with another teacher revision', async ({
    page,
    browser,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const secondTeacherEmail = `grade-race-${suffix}@yawp.test`;
    const secondTeacherPassword = 'grade-race-teacher-password';
    const secondTeacher = await prisma.user.create({
      data: {
        email: secondTeacherEmail,
        name: 'Second Grade Teacher',
        password: {
          create: { hash: bcrypt.hashSync(secondTeacherPassword, 10) },
        },
        memberships: {
          create: {
            organizationId: e2eContext.organizationId,
            role: 'TEACHER',
            classesAsTeacher: { connect: { id: e2eContext.classId } },
          },
        },
      },
      include: { memberships: true },
    });
    const secondMembership = secondTeacher.memberships[0]!;
    await prisma.$executeRaw`
      INSERT INTO "_SchoolTeachers" ("A", "B")
      VALUES (${secondMembership.id}, ${e2eContext.schoolId})
      ON CONFLICT DO NOTHING
    `;
    const document = await prisma.document.create({
      data: {
        title: `Grade revision coupling ${suffix}`,
        text: 'Two teachers must never overwrite a newer grade with a stale local snapshot.',
        html: '<p>Two teachers must never overwrite a newer grade with a stale local snapshot.</p>',
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        assignmentId: e2eContext.assignmentId,
        classAssignmentId: e2eContext.classAssignmentId,
      },
      select: { id: true, title: true, text: true, html: true },
    });
    const submission = await prisma.submission.create({
      data: {
        id: `e2e-released-grade-audit-revision-${suffix}`,
        documentId: document.id,
        title: document.title,
        text: document.text ?? '',
        html: document.html ?? '',
        submittedAt: new Date('2026-08-19T12:00:00.000Z'),
        gradedAt: new Date('2026-08-20T11:00:00.000Z'),
        gradedByMembershipId: e2eContext.teacherMembershipId,
        numericPercentage: 77,
        letterGrade: 'C+',
        score: '77% (C+)',
        overallComment: 'Initial grade.',
        releasedAt: new Date('2026-08-20T12:00:00.000Z'),
      },
      select: { id: true },
    });
    const secondContext = await browser.newContext();

    try {
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/submissions/${submission.id}`);
      const firstPanel = page.getByTestId('submission-lifecycle-panel');
      await firstPanel.getByTestId('submission-lifecycle-edit').click();
      await page.getByTestId('grading-overall-percentage').fill('82');
      await firstPanel.getByTestId('submission-lifecycle-save').click();
      await expect(firstPanel.getByText('82 / 100', { exact: true }).first()).toBeVisible({
        timeout: 15000,
      });

      const secondPage = await secondContext.newPage();
      await signInPage(secondPage, secondTeacherEmail, secondTeacherPassword);
      await secondPage.goto(`/app/submissions/${submission.id}`);
      const secondPanel = secondPage.getByTestId('submission-lifecycle-panel');
      await secondPanel.getByTestId('submission-lifecycle-edit').click();
      await secondPage.getByTestId('grading-overall-percentage').fill('93');
      await secondPanel.getByTestId('submission-lifecycle-save').click();
      await expect(secondPanel.getByText('93 / 100', { exact: true }).first()).toBeVisible({
        timeout: 15000,
      });

      // Title save forces a same-route loader revalidation on teacher A's
      // still-open page. Reopening must use teacher B's authoritative grade,
      // not teacher A's earlier optimistic snapshot with the fresh token.
      const titleInput = page.getByTestId('submission-title-input');
      await titleInput.fill(`Revalidated grade revision ${suffix}`);
      await titleInput.blur();
      await expect
        .poll(async () => {
          const row = await prisma.submission.findUniqueOrThrow({
            where: { id: submission.id },
            select: { title: true },
          });
          return row.title;
        })
        .toBe(`Revalidated grade revision ${suffix}`);
      await expect(firstPanel.getByText('93 / 100', { exact: true }).first()).toBeVisible({
        timeout: 15000,
      });

      await firstPanel.getByTestId('submission-lifecycle-edit').click();
      await expect(page.getByTestId('grading-overall-percentage')).toHaveValue(
        '93'
      );
      await page
        .getByTestId('grading-overall-comment')
        .fill('Teacher A acknowledged the newer revision.');
      await firstPanel.getByTestId('submission-lifecycle-save').click();

      await expect
        .poll(async () => {
          const row = await prisma.submission.findUniqueOrThrow({
            where: { id: submission.id },
            select: { numericPercentage: true, overallComment: true },
          });
          return row;
        })
        .toEqual({
          numericPercentage: 93,
          overallComment: 'Teacher A acknowledged the newer revision.',
        });
    } finally {
      await secondContext.close();
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "SET LOCAL yawp.submission_activity_cleanup = 'on'"
        );
        await tx.submissionActivity.deleteMany({
          where: { submissionId: submission.id },
        });
        await tx.submission.delete({ where: { id: submission.id } });
      });
      await prisma.document.delete({ where: { id: document.id } });
      await prisma.orgMembership.delete({
        where: { id: secondMembership.id },
      });
      await prisma.user.delete({ where: { id: secondTeacher.id } });
      await prisma.$disconnect();
    }
  });
});
