import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';

async function seedDailyPagesWork(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: e2eContext.classId,
      assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
      title: `SJP swap persistence ${Date.now()}`,
      prompt: 'Write about a habit you are trying to build.',
      pointValue: 12,
    });
    const document = await prisma.document.create({
      data: {
        title: 'Swap persistence doc',
        text: 'I kept writing even when I did not know where it was going.',
        html: '<p>I kept writing even when I did not know where it was going.</p>',
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
      },
      select: { id: true, title: true },
    });
    await prisma.submission.create({
      data: {
        documentId: document.id,
        html: document.html,
        text: document.text,
        title: document.title,
        submittedAt: new Date(),
        score: '10/12',
        overallScore: 10,
      },
    });
    return { assignmentTitle: assignment.title, documentTitle: document.title };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Daily Pages → SJP swap persistence (spec G)', () => {
  test('existing class documents and submissions stay visible after the teacher swap', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const seeded = await seedDailyPagesWork(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);

    await expect(page.getByText(seeded.assignmentTitle)).toBeVisible();
    await expect(page.getByText(seeded.documentTitle)).toBeVisible();
    await expect(page.getByText('10/12')).toBeVisible();
  });
});
