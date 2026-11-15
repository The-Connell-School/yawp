import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import {
  clickClassNewAssignment,
  expectTypeAbsentInPicker,
  expectTypePresentInPicker,
} from '../helpers/assignment-builder-v3-page';
import {
  expandAssignmentTypeSections,
  openClassAssignmentsTab,
} from '../test-helpers';

test.describe.serial('Admin assignment type archive', () => {
  test.setTimeout(60_000);

  test('soft-archives assignment types, hides them from new work, and restores them', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const archiveTypeTitle = `Archive smoke ${suffix}`;
    let archiveTypeId: string | undefined;
    let archiveAssignmentId: string | undefined;

    try {
      const archiveType = await prisma.assignmentType.create({
        data: {
          title: archiveTypeTitle,
          description: 'Disposable type for archive smoke.',
          position: 9500,
          ownerOrgId: e2eContext.organizationId,
          organizationAssignments: {
            create: { organizationId: e2eContext.organizationId },
          },
          assignmentModules: {
            create: {
              title: 'Archive module',
              position: 1,
              instructions: {
                create: {
                  title: 'Write',
                  prompt: 'Archive smoke prompt',
                  position: 1,
                },
              },
            },
          },
        },
        select: { id: true },
      });
      archiveTypeId = archiveType.id;
      const { assignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: archiveType.id,
        title: `Archive smoke assignment ${suffix}`,
        prompt: 'Archive smoke',
      });
      archiveAssignmentId = assignment.id;

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${archiveType.id}`);
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Archive assignment type' }).click();
      await page.getByRole('button', { name: 'Archive Assignment Type' }).click();
      await page.waitForURL('**/app/admin/assignments');

      const archived = await prisma.assignmentType.findUnique({
        where: { id: archiveType.id },
        select: { archivedAt: true },
      });
      expect(archived?.archivedAt).toBeInstanceOf(Date);

      await page.goto(`/app/admin/assignment-types/${archiveType.id}`);
      await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();

      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
      await openClassAssignmentsTab(page);
      await page.getByTestId('class-assignments-search').fill('E2E Class Assignment');
      await expandAssignmentTypeSections(page);
      await expect(
        page.getByTestId(`assignment-open-${e2eContext.assignmentId}`)
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByTestId(`assignment-open-${archiveAssignmentId}`)
      ).toBeVisible({ timeout: 30_000 });

      await clickClassNewAssignment(page);
      await expectTypeAbsentInPicker(page, archiveTypeTitle);
      await expectTypePresentInPicker(page, 'E2E Course');
      await page.goBack();
      await expect(page).toHaveURL(/tab=assignments/);

      await page.context().clearCookies();
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${archiveType.id}`);
      await page.getByRole('button', { name: 'Restore' }).click();
      await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);

      const restored = await prisma.assignmentType.findUnique({
        where: { id: archiveType.id },
        select: { archivedAt: true },
      });
      expect(restored?.archivedAt).toBeNull();

      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
      await openClassAssignmentsTab(page);
      await clickClassNewAssignment(page);
      await expectTypePresentInPicker(page, archiveTypeTitle);
    } finally {
      if (archiveAssignmentId) {
        await prisma.classAssignment.deleteMany({
          where: { assignmentId: archiveAssignmentId },
        });
        await prisma.assignment.deleteMany({
          where: { id: archiveAssignmentId },
        });
      }
      if (archiveTypeId) {
        await prisma.assignmentType.deleteMany({ where: { id: archiveTypeId } });
      }
      await prisma.$disconnect();
    }
  });
});