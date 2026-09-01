import bcrypt from 'bcryptjs';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

function createPassword(password: string) {
  return { hash: bcrypt.hashSync(password, 10) };
}

/**
 * Grading is a stack of papers. These specs cover flipping through that stack
 * from the grading header: the arrows walk the same list the teacher came from,
 * in the same order, and they survive releasing a grade mid-stack.
 */
test.describe('Teacher grading queue navigation', () => {
  const STUDENTS = ['Ana Reyes', 'Ben Cole', 'Cara Diaz'] as const;

  async function seedStack(
    prisma: ReturnType<typeof createE2EPrismaClient>,
    e2eContext: { organizationId: string; classId: string; assignmentTypeId: string; assignmentId: string; classAssignmentId: string },
    suffix: string
  ) {
    const membershipIds: string[] = [];
    const documentIds: string[] = [];
    const submissionIdByStudent = new Map<string, string>();

    // Submitted oldest-first so the default "last edited, newest first" sort
    // puts the stack in a known order.
    for (const [index, name] of STUDENTS.entries()) {
      const user = await prisma.user.create({
        data: {
          email: `${name.split(' ')[0].toLowerCase()}.${suffix}@yawp.test`,
          name,
          password: { create: createPassword('student-e2e-password') },
          memberships: {
            create: {
              organizationId: e2eContext.organizationId,
              role: 'STUDENT',
              classesAsStudent: { connect: { id: e2eContext.classId } },
            },
          },
        },
        include: { memberships: true },
      });
      const membershipId = user.memberships[0]!.id;
      membershipIds.push(membershipId);

      const body = `${name} on Hamlet ${suffix}`;
      const submittedAt = new Date(Date.now() - (STUDENTS.length - index) * 60_000);
      const document = await prisma.document.create({
        data: {
          title: `Hamlet essay — ${name}`,
          text: body,
          html: `<p>${body}</p>`,
          updatedAt: submittedAt,
          membershipId,
          assignmentTypeId: e2eContext.assignmentTypeId,
          assignmentId: e2eContext.assignmentId,
          classAssignmentId: e2eContext.classAssignmentId,
          submissions: {
            create: {
              title: `Hamlet essay — ${name}`,
              text: body,
              html: `<p>${body}</p>`,
              submittedAt,
            },
          },
        },
        select: { id: true, submissions: { select: { id: true } } },
      });
      documentIds.push(document.id);
      submissionIdByStudent.set(name, document.submissions[0]!.id);
    }

    return { membershipIds, documentIds, submissionIdByStudent };
  }

  async function cleanUp(
    prisma: ReturnType<typeof createE2EPrismaClient>,
    seeded: { membershipIds: string[]; documentIds: string[] }
  ) {
    await prisma.submission
      .deleteMany({ where: { documentId: { in: seeded.documentIds } } })
      .catch(() => {});
    await prisma.document
      .deleteMany({ where: { id: { in: seeded.documentIds } } })
      .catch(() => {});
    await prisma.orgMembership
      .deleteMany({ where: { id: { in: seeded.membershipIds } } })
      .catch(() => {});
  }

  test('a teacher flips through the needs-grading stack and past a release', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    let seeded = { membershipIds: [] as string[], documentIds: [] as string[] };

    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { gradingQueueNavEnabled: true },
      });

      const stack = await seedStack(prisma, e2eContext as never, suffix);
      seeded = stack;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

      // Enter the grading view the way a teacher does: from the needs-grading
      // list, by clicking the first paper.
      await page.goto('/app/documents?status=needs-grading&reset=1');
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('row', { name: /Hamlet essay — Ana Reyes/i })
        .first()
        .click();
      await page.waitForURL(/\/app\/submissions\//);

      const queue = page.getByTestId('grading-queue-nav');
      await expect(queue).toBeVisible();
      await expect(page.getByTestId('grading-student-name')).toHaveText(
        'Ana Reyes'
      );

      // At the top of the stack there is nowhere back to.
      await expect(page.getByTestId('grading-queue-previous')).toBeDisabled();

      // Forward through the stack, in list order.
      await page.getByTestId('grading-queue-next').click();
      await expect(page.getByTestId('grading-student-name')).toHaveText(
        'Ben Cole'
      );

      // ...and back again, so the arrows are a two-way street.
      await page.getByTestId('grading-queue-previous').click();
      await expect(page.getByTestId('grading-student-name')).toHaveText(
        'Ana Reyes'
      );

      // Releasing a grade must not strand the teacher: the paper they are
      // standing on stays in the queue even though it no longer matches the
      // "Needs Grading" filter, so Next still reaches the following student.
      const anaSubmissionId = stack.submissionIdByStudent.get('Ana Reyes')!;
      await prisma.submission.update({
        where: { id: anaSubmissionId },
        data: {
          gradedAt: new Date(),
          releasedAt: new Date(),
          numericPercentage: 92,
          letterGrade: 'A-',
        },
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('grading-queue-nav')).toBeVisible();
      await page.getByTestId('grading-queue-next').click();
      await expect(page.getByTestId('grading-student-name')).toHaveText(
        'Ben Cole'
      );
    } finally {
      await cleanUp(prisma, seeded);
      await prisma.organization
        .update({
          where: { id: e2eContext.organizationId },
          data: { gradingQueueNavEnabled: false },
        })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });

  test('the header is unchanged while the flag is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    let seeded = { membershipIds: [] as string[], documentIds: [] as string[] };

    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { gradingQueueNavEnabled: false },
      });

      seeded = await seedStack(prisma, e2eContext as never, suffix);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/documents?status=needs-grading&reset=1');
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('row', { name: /Hamlet essay — Ana Reyes/i })
        .first()
        .click();
      await page.waitForURL(/\/app\/submissions\//);

      await expect(page.getByTestId('grading-student-name')).toHaveText(
        'Ana Reyes'
      );
      await expect(page.getByTestId('grading-queue-nav')).toHaveCount(0);
    } finally {
      await cleanUp(prisma, seeded);
      await prisma.$disconnect();
    }
  });
});
