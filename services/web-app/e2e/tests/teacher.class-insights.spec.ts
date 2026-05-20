import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setClassInsightsForOrganization } from '../db-helpers';

test.describe.serial('Class Insights panel feature flag', () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await setClassInsightsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: false,
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function openAssignmentDetail(
    page: import('@playwright/test').Page,
    classId: string
  ) {
    const prisma = createE2EPrismaClient();
    try {
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { classId },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      await page.goto(
        `/app/my-classes/${classId}/assignments/${assignment.id}?status=graded`
      );
      await page.waitForLoadState('networkidle');
    } finally {
      await prisma.$disconnect();
    }
  }

  test('hides Class Insights panel when flag is OFF', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openAssignmentDetail(page, e2eContext.classId);

    await expect(
      page.getByRole('heading', { name: /class insights/i })
    ).toHaveCount(0);
  });

  test('shows Class Insights panel when flag is ON', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await setClassInsightsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: true,
      });
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openAssignmentDetail(page, e2eContext.classId);

    await expect(
      page.getByRole('heading', { name: /class insights/i })
    ).toBeVisible();
  });
});
