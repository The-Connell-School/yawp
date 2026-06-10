import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const STRESS_COUNT = 50;

test.describe.serial('Teacher surfaces under stress volume', () => {
  test('class documents and student work stay usable with 50 graded docs for one student', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const assignmentTitle = `Stress Assignment ${suffix}`;
    const documentIds: string[] = [];
    let assignmentId = '';

    try {
      const studentProfile = await prisma.studentProfile.findFirstOrThrow({
        where: { profileId: e2eContext.profileId },
        select: { id: true },
      });
      const assignment = await prisma.assignment.create({
        data: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.assignmentTypeId,
          title: assignmentTitle,
          prompt: 'Stress-test prompt.',
        },
        select: { id: true },
      });
      assignmentId = assignment.id;

      for (let index = 0; index < STRESS_COUNT; index++) {
        const body = `Stress body ${index + 1}`;
        const document = await prisma.document.create({
          data: {
            title: `Stress Doc ${suffix} ${String(index + 1).padStart(2, '0')}`,
            text: body,
            html: `<p>${body}</p>`,
            profile: { connect: { id: e2eContext.profileId } },
            studentProfile: { connect: { id: studentProfile.id } },
            assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
            assignment: { connect: { id: assignment.id } },
            submissions: {
              create: {
                title: `Stress Submission ${suffix} ${String(index + 1).padStart(2, '0')}`,
                text: body,
                html: `<p>${body}</p>`,
                submittedAt: new Date(Date.now() - index * 60_000),
                gradedAt: new Date(Date.now() - index * 30_000),
                numericPercentage: 70 + (index % 30),
                ...(index % 3 === 0 ? { releasedAt: new Date() } : {}),
              },
            },
          },
          select: { id: true },
        });
        documentIds.push(document.id);
      }

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

      // Class documents grouped by assignment: the stress group renders with
      // its full count.
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&documentGroup=assignment`
      );
      await page.waitForLoadState('networkidle');
      const classGroup = page.getByRole('button', {
        name: new RegExp(`${assignmentTitle}\\s+${STRESS_COUNT}`),
      });
      await expect(classGroup).toBeVisible();

      // Status filter still narrows under volume.
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&assignmentId=${assignment.id}&status=graded`
      );
      await page.waitForLoadState('networkidle');
      const classTable = page.getByRole('table', { name: /class documents/i });
      await expect(classTable.getByText(/^Graded/).first()).toBeVisible();
      await expect(classTable.getByText(/^Released/)).toHaveCount(0);

      // Student Work grouped by student shows the volume in one group.
      await page.goto('/app/student-work?group=student');
      await page.waitForLoadState('networkidle');
      const studentGroup = page
        .getByRole('button', { name: /John Doe/i })
        .first();
      await expect(studentGroup).toBeVisible();

      // Filtering by the stress assignment shows all 50 rows without breaking.
      await page.goto(`/app/student-work?assignment=${assignment.id}`);
      await page.waitForLoadState('networkidle');
      const workTable = page.getByRole('table', { name: /student work/i });
      await expect(workTable.locator('tbody tr')).toHaveCount(STRESS_COUNT);
    } finally {
      await prisma.submission
        .deleteMany({ where: { documentId: { in: documentIds } } })
        .catch(() => {});
      await prisma.document
        .deleteMany({ where: { id: { in: documentIds } } })
        .catch(() => {});
      if (assignmentId) {
        await prisma.assignment
          .delete({ where: { id: assignmentId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });
});
