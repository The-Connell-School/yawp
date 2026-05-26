import { type Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  clearPilotFeatureAccessTargets,
  createTeacherClassPilotFixture,
  setAssignmentsForOrganization,
  setDocumentSubmissionForSchool,
  setPilotFeatureAccessTarget,
} from '../db-helpers';

async function clearBrowserSession(page: Page) {
  await page.context().clearCookies();
}

async function authenticateAs(params: {
  page: Page;
  prisma: ReturnType<typeof createE2EPrismaClient>;
  userId: string;
}) {
  const { page, prisma, userId } = params;
  await clearBrowserSession(page);

  const { authSessionStorage } = await import(
    '../../app/cookie-session-storages/authentication.server'
  );

  const expirationDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
  const session = await prisma.session.create({
    data: {
      userId,
      expirationDate,
    },
    select: {
      id: true,
      expirationDate: true,
    },
  });
  const authSession = await authSessionStorage.getSession();
  authSession.set('sessionId', session.id);
  const cookieHeader = await authSessionStorage.commitSession(authSession, {
    expires: session.expirationDate,
  });
  const [cookiePair] = cookieHeader.split(';');
  const [name, ...valueParts] = cookiePair.split('=');

  await page.context().addCookies([
    {
      name,
      value: valueParts.join('='),
      url: 'http://127.0.0.1:5173',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(session.expirationDate.getTime() / 1000),
    },
  ]);
}

async function postCreateAssignment(params: {
  page: Page;
  classId: string;
  assignmentTypeId: string;
  title: string;
}) {
  const { page, classId, assignmentTypeId, title } = params;
  return page.evaluate(
    async ({ classId, assignmentTypeId, title }) => {
      const formData = new FormData();
      formData.set('intent', 'create-assignment');
      formData.set('assignmentTypeId', assignmentTypeId);
      formData.set('title', title);
      formData.set('prompt', `${title} prompt`);

      const response = await fetch(`/app/my-classes/${classId}`, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
        redirect: 'manual',
      });

      return {
        status: response.status,
        text: await response.text(),
      };
    },
    { classId, assignmentTypeId, title }
  );
}

async function postSubmitDocument(params: {
  page: Page;
  documentId: string;
  title: string;
}) {
  const { page, documentId, title } = params;
  return page.evaluate(
    async ({ documentId, title }) => {
      const formData = new FormData();
      formData.set('documentId', documentId);
      formData.set('title', title);

      const response = await fetch('/api/domain/submit-document', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
        redirect: 'manual',
      });

      return {
        status: response.status,
        type: response.type,
        contentType: response.headers.get('content-type'),
        text: await response.text(),
      };
    },
    { documentId, title }
  );
}

test.describe.serial('Teacher/class pilot feature rollout', () => {
  test('allows a targeted pilot teacher/class while hiding and blocking the same controls for a non-pilot class', async ({
    page,
    e2eContext,
    helpers,
  }) => {
    test.setTimeout(120_000);
    const prisma = createE2EPrismaClient();
    const suffix = `rollout-${Date.now()}`;
    const pilotAssignmentTitle = `Pilot rollout assignment ${suffix}`;

    try {
      const nonPilot = await createTeacherClassPilotFixture({
        prisma,
        organizationId: e2eContext.organizationId,
        schoolId: e2eContext.schoolId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        suffix,
      });

      await clearPilotFeatureAccessTargets({ prisma });
      await setAssignmentsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: false,
      });
      await setDocumentSubmissionForSchool({
        prisma,
        schoolId: e2eContext.schoolId,
        enabled: false,
      });
      await setPilotFeatureAccessTarget({
        prisma,
        featureKey: 'assignments',
        targetKind: 'class',
        targetId: e2eContext.classId,
        enabled: true,
        note: 'E2E pilot rollout class target',
      });
      await setPilotFeatureAccessTarget({
        prisma,
        featureKey: 'document_submission_grading',
        targetKind: 'class',
        targetId: e2eContext.classId,
        enabled: true,
        note: 'E2E pilot rollout class target',
      });

      await authenticateAs({
        page,
        prisma,
        userId: e2eContext.teacherUserId,
      });
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(
        1
      );
      await expect(
        page.getByRole('button', { name: /create new assignment/i })
      ).toBeVisible();

      const pilotCreateResponse = await postCreateAssignment({
        page,
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title: pilotAssignmentTitle,
      });
      expect(pilotCreateResponse.status).toBe(200);
      expect(pilotCreateResponse.text).toContain(
        'Assignment created successfully'
      );

      await authenticateAs({
        page,
        prisma,
        userId: nonPilot.teacherUserId,
      });
      await page.goto(`/app/my-classes/${nonPilot.classId}`);
      await page.waitForLoadState('networkidle');
      await expect
        .soft(page.getByRole('tab', { name: /assignments/i }))
        .toHaveCount(0);
      await expect.soft(
        page.getByRole('button', { name: /create new assignment/i })
      ).toHaveCount(0);

      const nonPilotCreateResponse = await postCreateAssignment({
        page,
        classId: nonPilot.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title: `Blocked rollout assignment ${suffix}`,
      });
      expect(nonPilotCreateResponse.status).toBe(403);
      expect(nonPilotCreateResponse.text).toContain(
        'Assignments are not enabled'
      );

      await authenticateAs({
        page,
        prisma,
        userId: e2eContext.userId,
      });
      await page.goto('/app?tab=assignments');
      await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(
        1
      );
      await expect(page.getByText('E2E Class Assignment')).toBeVisible();

      await helpers.openDocument(e2eContext.submittedDocumentId);
      await expect(page.getByTestId('document-submit-button')).toBeVisible();
      const pilotSubmitResponse = await postSubmitDocument({
        page,
        documentId: e2eContext.submittedDocumentId,
        title: `Pilot rollout submission ${suffix}`,
      });
      expect(pilotSubmitResponse.status).toBe(200);
      expect(pilotSubmitResponse.text).toContain(
        'Essay submitted successfully'
      );

      await authenticateAs({
        page,
        prisma,
        userId: nonPilot.studentUserId,
      });
      await page.goto('/app?tab=assignments');
      await expect(page).toHaveURL(/\/app\/?$/);
      await expect
        .soft(page.getByRole('tab', { name: /assignments/i }))
        .toHaveCount(0);
      await expect.soft(
        page.getByText(`Non-pilot assignment ${suffix}`)
      ).toHaveCount(0);

      await page.goto(`/app/documents/${nonPilot.documentId}`);
      await page.waitForLoadState('networkidle');
      await expect
        .soft(page.getByTestId('document-submit-button'))
        .toHaveCount(0);
      const nonPilotSubmitResponse = await postSubmitDocument({
        page,
        documentId: nonPilot.documentId,
        title: `Blocked rollout submission ${suffix}`,
      });
      expect(nonPilotSubmitResponse).toMatchObject({
        status: 0,
        type: 'opaqueredirect',
      });
    } finally {
      await prisma.assignment.deleteMany({
        where: { title: pilotAssignmentTitle },
      });
      await clearPilotFeatureAccessTargets({ prisma });
      await setAssignmentsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: true,
      });
      await setDocumentSubmissionForSchool({
        prisma,
        schoolId: e2eContext.schoolId,
        enabled: true,
      });
      await prisma.$disconnect();
    }
  });
});
