import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';
import legacySchema from '../../app/domain/rubrics/library/daily-pages-engagement-v1.fixture.json' with {
  type: 'json',
};

async function seedPinnedLegacyDailyPagesWork(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const revision = await prisma.rubricRevision.create({
      data: {
        id: `legacy-pin-${Date.now()}`,
        rubricName: 'daily-pages-engagement',
        version: 99_001,
        schemaJson: legacySchema,
        fingerprint: `legacy-pin-${Date.now()}`,
        requestId: `legacy-pin-${Date.now()}`,
        requestHash: `legacy-pin-${Date.now()}`,
        createdBy: 'e2e',
        reason: `assignment-type:${e2eContext.dailyPagesAssignmentTypeId}`,
      },
      select: { id: true },
    });
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: e2eContext.classId,
      assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
      title: `Pinned legacy Daily Pages ${Date.now()}`,
      prompt: 'Describe a place that matters to you.',
      pointValue: 30,
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { rubricRevisionId: revision.id },
    });
    const text = 'My grandmother’s kitchen still smells like cinnamon.';
    const html = `<p>${text}</p>`;
    const document = await prisma.document.create({
      data: {
        title: 'Pinned legacy doc',
        text,
        html,
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
      },
      select: { id: true },
    });
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        html,
        text,
        title: 'Pinned legacy submission',
        submittedAt: new Date(),
      },
      select: { id: true },
    });
    return submission.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Pinned legacy Daily Pages assignment', () => {
  test('shows ALL IN / SHOWED UP / HARDLY THERE / NOT HANDED IN on the grading screen', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const submissionId = await seedPinnedLegacyDailyPagesWork(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${submissionId}?edit=1`);
    await page.getByRole('button', { name: /^Engagement with Prompt/i }).click();
    await expect(page.getByText('NOT HANDED IN')).toBeVisible();
    await expect(page.getByText('HARDLY THERE')).toBeVisible();
    await expect(page.getByText('SHOWED UP')).toBeVisible();
    await expect(page.getByText('ALL IN')).toBeVisible();
  });
});
