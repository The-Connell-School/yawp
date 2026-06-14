import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

test.describe.serial('Teacher grading assistant legacy flow', () => {
  test('keeps the existing unlinked submission grading assistant button working', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    test.setTimeout(60_000);

    const prisma = createE2EPrismaClient();
    try {
      const submission = await prisma.submission.findUniqueOrThrow({
        where: { id: e2eContext.submittedSubmissionId },
        select: {
          document: { select: { assignmentTypeId: true } },
        },
      });
      const defaultLink = await prisma.assignmentTypeGradingAssistant.findFirst({
        where: {
          assignmentTypeId: submission.document.assignmentTypeId,
          isDefault: true,
          activeTo: null,
        },
      });
      expect(defaultLink).toBeNull();

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/submissions/${e2eContext.submittedSubmissionId}?edit=1`
      );
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('grading-assistant-generate')).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/grade-essay-ai') &&
          response.request().method() === 'POST'
      );
      await page.getByTestId('grading-assistant-generate').click();
      const response = await responsePromise;

      expect(response.status()).toBe(200);
      expect(response.request().postData() ?? '').toContain(
        `submissionId=${e2eContext.submittedSubmissionId}`
      );
      await expect(page.getByTestId('grading-overall-comment')).toHaveValue(
        'John, these legacy grading assistant suggestions still apply.'
      );
      await expect(page.getByTestId('grading-overall-percentage')).toHaveValue(
        '88'
      );

      await page.getByRole('button', { name: /Thesis\/Content/i }).click();
      await expect(
        page.getByTestId('grading-rubric-score-thesis_and_content')
      ).toContainText('5 - Exemplary');
      await expect(
        page.getByTestId('grading-rubric-comment-thesis_and_content')
      ).toHaveValue('Legacy thesis feedback from deterministic E2E.');

      await page
        .getByRole('button', { name: /Grammar\/Syntax\/Formatting/i })
        .click();
      await expect(page.getByText('AI grammar issues shown: 1/1')).toBeVisible();
      await expect(
        page.getByText('Use a more precise verb in this sentence.')
      ).toBeVisible();

      const updated = await prisma.submission.findUniqueOrThrow({
        where: { id: e2eContext.submittedSubmissionId },
        select: { aiMeta: true },
      });
      expect(updated.aiMeta).toMatchObject({
        gradingAssistantTemplateId: 'gait_thesis_current_v1',
        gradingAssistantTemplateSlug: 'thesis-driven-essay-current',
        gradingAssistantSource: 'legacy-fallback',
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('renders ACT template rubric controls without replacing thesis controls globally', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    let actAssignmentTypeId: string | null = null;
    let actAssignmentId: string | null = null;
    let actDocumentId: string | null = null;
    let actSubmissionId: string | null = null;

    try {
      const actAssignmentType = await prisma.assignmentType.create({
        data: {
          title: `ACT Writing E2E ${suffix}`,
          kind: `act_writing_e2e_${suffix}`,
          position: 99,
          ownerOrgId: e2eContext.organizationId,
          organizationAssignments: {
            create: { organizationId: e2eContext.organizationId },
          },
        },
        select: { id: true },
      });
      actAssignmentTypeId = actAssignmentType.id;

      await prisma.assignmentTypeGradingAssistant.create({
        data: {
          assignmentTypeId: actAssignmentType.id,
          gradingAssistantTemplateId: 'gait_act_writing_v1',
          isDefault: true,
          activeFrom: new Date(0),
        },
      });

      const { assignment: actAssignment, classAssignment: actClassAssignment } =
        await createDeployedAssignment({
          prisma,
          classId: e2eContext.classId,
          assignmentTypeId: actAssignmentType.id,
          title: `ACT Writing E2E Assignment ${suffix}`,
          prompt:
            'Machines are changing public life. Write an ACT essay that evaluates three perspectives.',
        });
      actAssignmentId = actAssignment.id;

      const actEssay =
        'Public spaces should use automation carefully because machines can make services faster, but people still need judgment and empathy. Perspective One is right that automation can reduce tedious work, but Perspective Three is stronger because public life depends on trust.';
      const actDocument = await prisma.document.create({
        data: {
          title: `ACT Writing E2E Document ${suffix}`,
          text: actEssay,
          html: `<p>${actEssay}</p>`,
          revision: 1,
          membershipId: e2eContext.membershipId,
          assignmentTypeId: actAssignmentType.id,
          assignmentId: actAssignment.id,
          classAssignmentId: actClassAssignment.id,
        },
        select: { id: true },
      });
      actDocumentId = actDocument.id;

      const actSubmission = await prisma.submission.create({
        data: {
          documentId: actDocument.id,
          title: `ACT Writing E2E Submission ${suffix}`,
          text: actEssay,
          html: `<p>${actEssay}</p>`,
          submittedAt: new Date(),
        },
        select: { id: true },
      });
      actSubmissionId = actSubmission.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/submissions/${actSubmission.id}?edit=1`);
      await page.waitForLoadState('networkidle');

      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/grade-essay-ai') &&
          response.request().method() === 'POST'
      );
      await page.getByTestId('grading-assistant-generate').click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);

      await expect(
        page.getByRole('button', { name: /Ideas and Analysis/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Development and Support/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^Organization\b/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: /Language Use and Conventions/i,
        })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Thesis\/Content/i })
      ).toHaveCount(0);
      await expect(page.getByTestId('grading-overall-comment')).toHaveValue(
        'John, these legacy grading assistant suggestions still apply.'
      );
      await page.waitForTimeout(250);

      await page.getByRole('button', { name: /Ideas and Analysis/i }).click();
      const ideasComment = page.getByTestId(
        'grading-rubric-comment-ideas_and_analysis'
      );
      await ideasComment.fill(
        'Teacher override keeps the ACT Ideas and Analysis key.'
      );
      await expect(ideasComment).toHaveValue(
        'Teacher override keeps the ACT Ideas and Analysis key.'
      );
      const saveResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/update-submission') &&
          response.request().method() === 'POST' &&
          response.status() === 200
      );
      await page.getByTestId('grading-overall-comment').click();
      await saveResponse;
      await expect(page.getByTestId('grading-auto-save-status')).toContainText(
        'Saved',
        { timeout: 15000 }
      );

      const updatedActSubmission = await prisma.submission.findUniqueOrThrow({
        where: { id: actSubmission.id },
        select: { rubricScores: true, aiMeta: true },
      });
      expect(updatedActSubmission.aiMeta).toMatchObject({
        gradingAssistantTemplateSlug: 'act-writing-four-domain',
      });
      expect(Object.keys(updatedActSubmission.rubricScores as object).sort()).toEqual(
        [
          'development_and_support',
          'ideas_and_analysis',
          'language_use_and_conventions',
          'organization',
        ]
      );
      expect(
        (
          updatedActSubmission.rubricScores as Record<
            string,
            { score?: number; comment?: string }
          >
        ).ideas_and_analysis
      ).toMatchObject({
        score: 6,
        comment: 'Teacher override keeps the ACT Ideas and Analysis key.',
      });

      await page.goto(
        `/app/submissions/${e2eContext.submittedSubmissionId}?edit=1`
      );
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('button', { name: /Thesis\/Content/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Ideas and Analysis/i })
      ).toHaveCount(0);
    } finally {
      if (actSubmissionId) {
        await prisma.submission.deleteMany({ where: { id: actSubmissionId } });
      }
      if (actDocumentId) {
        await prisma.document.deleteMany({ where: { id: actDocumentId } });
      }
      if (actAssignmentId) {
        await prisma.assignment.deleteMany({ where: { id: actAssignmentId } });
      }
      if (actAssignmentTypeId) {
        await prisma.assignmentTypeGradingAssistant.deleteMany({
          where: { assignmentTypeId: actAssignmentTypeId },
        });
        await prisma.organizationAssignmentType.deleteMany({
          where: { assignmentTypeId: actAssignmentTypeId },
        });
        await prisma.assignmentType.deleteMany({
          where: { id: actAssignmentTypeId },
        });
      }
      await prisma.$disconnect();
    }
  });
});
