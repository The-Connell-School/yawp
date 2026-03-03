import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setAssignmentsForOrganization } from '../db-helpers';

test.describe.serial('Assignments org-level feature flag', () => {
  test('hides Assignments tab on student dashboard when flag is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setAssignmentsForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: false,
    });

    await signIn('jdoe@brock.software', 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(0);
  });

  test('shows Assignments tab on student dashboard when flag is on', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setAssignmentsForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn('jdoe@brock.software', 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(1);
  });

  test('hides Assignments tab on teacher class page when flag is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setAssignmentsForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: false,
    });

    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(0);
  });

  test('shows Assignments tab on teacher class page when flag is on', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    await setAssignmentsForOrganization({
      prisma,
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(1);
  });
});
