import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import { join } from 'node:path';

test.describe.serial('Rubric display feedback views', () => {
  test.setTimeout(180_000);

  test('honors showCategories and perCategoryComments for teacher and student', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const rubricName = `rubric-display-${suffix}`;
    const screenshotDir = join(
      process.cwd(),
      'test-results',
      'rubric-display-feedback'
    );
    let submissionId: string | null = null;

    const schema = {
      name: rubricName,
      title: `Display E2E ${suffix}`,
      scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 },
      rubric: {
        categories: [
          {
            key: 'quality',
            label: 'Quality',
            weight: 1,
            description: 'Overall writing quality.',
            feedbackEnabled: true,
          },
        ],
      },
      promptConfig: { gradingInstructions: 'Grade fairly.' },
      outputSchema: {
        schemaVersion: 1,
        responseShape: 'categories_overall_comment',
        display: {
          showCategories: false,
          perCategoryComments: false,
          grammarHighlight: 'highlight',
          teacherNotes: true,
        },
      },
    };

    const rubric = await prisma.rubric.create({
      data: { name: rubricName, title: schema.title, schemaJson: schema },
    });

    const assignmentType = await prisma.assignmentType.create({
      data: {
        title: `Display type ${suffix}`,
        position: 98000 + (suffix % 1000),
        rubricId: rubric.id,
        ownerOrgId: e2eContext.organizationId,
      },
    });

    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: e2eContext.classId,
      assignmentTypeId: assignmentType.id,
      prompt: 'Write about a meaningful place.',
      pointValue: 20,
    });

    const document = await prisma.document.create({
      data: {
        title: 'Display options submission',
        text: 'The river behind our house runs cold in March.',
        html: '<p>The river behind our house runs cold in March.</p>',
        membershipId: e2eContext.membershipId,
        assignmentTypeId: assignmentType.id,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
      },
    });
    submissionId = document.id;

    await prisma.submission.create({
      data: {
        id: document.id,
        documentId: document.id,
        title: document.title,
        text: document.text ?? '',
        html: document.html ?? '',
        submittedAt: new Date(),
        gradedAt: new Date(),
        releasedAt: new Date(),
        overallScore: 4,
        score: '4/5',
        overallComment: 'Your river image stays with the reader.',
        rubricScores: {
          quality: { score: 4, comment: 'SECRET_CATEGORY_COMMENT' },
        },
        aiMeta: {
          displaySnapshot: {
            showCategories: false,
            perCategoryComments: false,
            grammarHighlight: 'highlight',
            teacherNotes: true,
          },
        },
      },
    });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${submissionId}`);
    await expect(page.getByText('Your river image stays with the reader.')).toBeVisible();
    await expect(page.getByText('Rubric')).toHaveCount(0);
    await expect(page.getByText('SECRET_CATEGORY_COMMENT')).toHaveCount(0);
    await expect(page.getByTestId('grammar-highlight-caption')).toContainText(
      "doesn't lower the grade"
    );
    await page.screenshot({
      path: join(screenshotDir, 'teacher-hidden-categories.png'),
      fullPage: true,
    });

    const studentPage = await page.context().browser()!.newPage();
    await studentPage.goto('/auth/dev-login');
    await studentPage.evaluate(async () => {
      const response = await fetch('/auth/dev-login', {
        method: 'POST',
        body: new URLSearchParams({ email: 'dev.student@yawp.local' }),
      });
      if (!response.ok) throw new Error('Student dev login failed');
    });
    await studentPage.goto(`/app/submissions/${submissionId}`);
    await expect(studentPage.getByText('Your river image stays with the reader.')).toBeVisible();
    await expect(studentPage.getByText('Rubric')).toHaveCount(0);
    await expect(studentPage.getByText('SECRET_CATEGORY_COMMENT')).toHaveCount(0);
    await studentPage.screenshot({
      path: join(screenshotDir, 'student-hidden-categories.png'),
      fullPage: true,
    });
    await studentPage.close();

    if (submissionId) {
      await prisma.submissionGradingAssistantRun.deleteMany({
        where: { submissionId },
      });
      await prisma.submission.deleteMany({ where: { id: submissionId } });
      await prisma.document.deleteMany({ where: { id: submissionId } });
    }
    await prisma.assignmentType.delete({ where: { id: assignmentType.id } });
    await prisma.rubric.delete({ where: { id: rubric.id } });
  });
});
