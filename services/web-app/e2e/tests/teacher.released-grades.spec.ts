import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setReleasedGradesOrganizationForOrganization } from '../db-helpers';

test.describe.serial('Released grades organization view', () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await setReleasedGradesOrganizationForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: false,
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('redirects to class page when feature flag is OFF', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: false,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}/released-grades`);
    await page.waitForLoadState('networkidle');

    // Loader throws redirect → URL settles on the class page.
    await expect(page).toHaveURL(
      new RegExp(`/app/my-classes/${e2eContext.classId}(\\?|$)`)
    );
  });

  test('renders the released-grades view when feature flag is ON', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}/released-grades`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /Released grades/ })
    ).toBeVisible();
    // By-assignment is the default view; the pivot toggle should be visible.
    await expect(
      page.getByRole('tab', { name: /by assignment/i })
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: /by student/i })
    ).toBeVisible();
  });

  test('"Released grades" link appears on class page when flag is ON', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('link', { name: /Released grades/ })
    ).toBeVisible();
  });

  test('by-student pivot loads via ?view=byStudent when flag is ON', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setReleasedGradesOrganizationForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });
    await prisma.$disconnect();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/my-classes/${e2eContext.classId}/released-grades?view=byStudent`
    );
    await page.waitForLoadState('networkidle');

    const byStudentTab = page.getByRole('tab', { name: /by student/i });
    await expect(byStudentTab).toHaveAttribute('aria-selected', 'true');
  });
});
