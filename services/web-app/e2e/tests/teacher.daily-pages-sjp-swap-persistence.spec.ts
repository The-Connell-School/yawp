import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';
import engagementSchema from '../../app/domain/rubrics/library/daily-pages-engagement.json' with {
  type: 'json',
};

async function ensureSjpDailyPagesType(
  e2eContext: E2EContext,
  prisma: ReturnType<typeof createE2EPrismaClient>
) {
  const existing = await prisma.assignmentType.findFirst({
    where: {
      title: 'SJP Daily Pages E2E',
      ownerOrgId: e2eContext.organizationId,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  let rubric = await prisma.rubric.findFirst({
    where: { name: 'daily-pages-engagement' },
    select: { id: true },
  });
  if (!rubric) {
    rubric = await prisma.rubric.create({
      data: {
        name: 'daily-pages-engagement',
        title: 'Daily Pages engagement',
        schemaJson: engagementSchema,
      },
      select: { id: true },
    });
  }

  const sjpType = await prisma.assignmentType.create({
    data: {
      title: 'SJP Daily Pages E2E',
      position: 99,
      kind: null,
      rubricId: rubric.id,
      ownerOrgId: e2eContext.organizationId,
      organizationAssignments: {
        create: { organizationId: e2eContext.organizationId },
      },
      assignmentModules: {
        create: {
          title: 'SJP Daily Pages',
          position: 1,
          instructions: {
            create: {
              title: 'Write',
              prompt: 'Write for ten minutes.',
              position: 1,
              showChatButton: true,
            },
          },
        },
      },
    },
    select: { id: true },
  });
  return sjpType.id;
}

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
    const text =
      'I kept writing even when I did not know where it was going.';
    const html = `<p>${text}</p>`;
    const document = await prisma.document.create({
      data: {
        title: 'Swap persistence doc',
        text,
        html,
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
        html,
        text,
        title: document.title ?? 'Swap persistence doc',
        submittedAt: new Date(),
        score: '10/12',
        overallScore: 10,
      },
    });
    return {
      assignmentTitle: assignment.title ?? 'SJP swap persistence',
      documentTitle: document.title ?? 'Swap persistence doc',
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function swapTeacherToSjpOnly(
  e2eContext: E2EContext,
  sjpTypeId: string
) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.teacherAssignmentType.deleteMany({
      where: { membershipId: e2eContext.teacherMembershipId },
    });
    await prisma.orgMembership.update({
      where: { id: e2eContext.teacherMembershipId },
      data: {
        assignmentTypesCustomized: true,
        assignmentTypeAssignments: {
          deleteMany: {},
          create: { assignmentTypeId: sjpTypeId },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function restoreTeacherAssignmentTypes(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.teacherAssignmentType.deleteMany({
      where: { membershipId: e2eContext.teacherMembershipId },
    });
    await prisma.orgMembership.update({
      where: { id: e2eContext.teacherMembershipId },
      data: {
        assignmentTypesCustomized: false,
        assignmentTypeAssignments: { deleteMany: {} },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Daily Pages → SJP swap persistence (spec G)', () => {
  let sjpTypeId: string;

  test.beforeAll(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      sjpTypeId = await ensureSjpDailyPagesType(e2eContext, prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterEach(async ({ e2eContext }) => {
    await restoreTeacherAssignmentTypes(e2eContext);
  });

  test('teacher swap hides Daily Pages from the picker but keeps class work visible', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const seeded = await seedDailyPagesWork(e2eContext);
    await swapTeacherToSjpOnly(e2eContext, sjpTypeId);

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(
      page.locator(
        `a[href="/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}"]`
      )
    ).toHaveCount(0);
    await expect(
      page.locator(`a[href="/app/assignment-types/${sjpTypeId}"]`)
    ).toBeVisible();

    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=documents`
    );
    await expect(page.getByText(seeded.documentTitle).first()).toBeVisible();
    await expect(page.getByText(/10\s*\/\s*12/)).toBeVisible();
  });

  test('student still sees documents, assignments, and grades after the swap', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await expect(page.getByText('Swap persistence doc')).toBeVisible();
    await expect(page.getByText(/10\s*\/\s*12/)).toBeVisible();
  });
});
