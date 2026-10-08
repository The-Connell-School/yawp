import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';
import legacySchema from '../../app/domain/rubrics/library/daily-pages-engagement-v1.fixture.json' with {
  type: 'json',
};

async function seedPinnedLegacyDailyPagesWork(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const rubricName = `assignment-type:${e2eContext.dailyPagesAssignmentTypeId}`;
    const stamp = Date.now();
    const maxVersion = await prisma.rubricRevision.aggregate({
      where: { rubricName },
      _max: { version: true },
    });
    const version = (maxVersion._max.version ?? 0) + 1;
    const revision = await prisma.rubricRevision.create({
      data: {
        id: `legacy-pin-${stamp}`,
        rubricName,
        version,
        schemaJson: legacySchema,
        fingerprint: `legacy-pin-${stamp}`,
        requestId: `legacy-pin-${stamp}`,
        requestHash: `legacy-pin-${stamp}`,
        createdBy: 'e2e',
        reason: rubricName,
      },
      select: { id: true },
    });

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Assignment" DISABLE TRIGGER "internal_assignment_rubric_pin"'
    );
    const assignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
        title: `Pinned legacy Daily Pages ${stamp}`,
        prompt: 'Describe a place that matters to you.',
        pointValue: 30,
        rubricRevisionId: revision.id,
      },
    });
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Assignment" ENABLE TRIGGER "internal_assignment_rubric_pin"'
    );

    const classAssignment = await prisma.classAssignment.create({
      data: {
        assignmentId: assignment.id,
        classId: e2eContext.classId,
      },
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
    const scoreControl = page.getByTestId(
      'grading-rubric-score-engagement_with_prompt'
    );
    await scoreControl.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    for (const label of [
      'Excellent',
      'Good',
      'Needs Improvement',
      'Absent/Missing',
    ]) {
      await expect(
        listbox.getByRole('option', { name: label, exact: true }).first()
      ).toBeVisible();
    }
  });
});
