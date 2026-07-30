import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin tutor guidelines', () => {
  test.setTimeout(90_000);

  test('shows the universal guidelines as always on and saves course guidelines', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const title = `Tutor Guidelines E2E ${suffix}`;
    let assignmentTypeId: string | null = null;

    try {
      const position = await prisma.assignmentType.count();
      const assignmentType = await prisma.assignmentType.create({
        data: {
          title,
          description: 'Created by the tutor guidelines e2e test.',
          position,
        },
        select: { id: true },
      });
      assignmentTypeId = assignmentType.id;

      const assignmentModule = await prisma.assignmentModule.create({
        data: {
          title: 'Write',
          description: 'Draft the essay.',
          position: 0,
          assignmentTypeId: assignmentType.id,
        },
        select: { id: true },
      });

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${assignmentType.id}`);
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();

      // The universal layer is always on and readable from the course screen.
      const universalBanner = page.getByTestId('tutor-guidelines-universal');
      await expect(universalBanner).toBeVisible();
      await expect(universalBanner).toContainText(
        'Universal YAWP tutoring guidelines'
      );
      await page.getByTestId('tutor-guidelines-universal-trigger').click();
      await expect(
        page.getByTestId('tutor-guidelines-universal-sheet')
      ).toContainText('Guide, never ghostwrite');
      await page.keyboard.press('Escape');

      // Course guidelines stack on top of the universal layer.
      await page
        .locator('#courseTutorInstructions')
        .fill('Coach AP Lit prose analysis against the 6-point rubric.');
      await page.getByRole('button', { name: 'Update' }).click();

      await expect
        .poll(
          async () =>
            (
              await prisma.assignmentType.findUniqueOrThrow({
                where: { id: assignmentType.id },
                select: { tutorInstructions: true },
              })
            ).tutorInstructions,
          { timeout: 15_000 }
        )
        .toBe('Coach AP Lit prose analysis against the 6-point rubric.');

      // The module screen names every layer the tutor actually receives.
      await page.goto(
        `/app/admin/assignment-types/${assignmentType.id}/modules/${assignmentModule.id}`
      );
      await expect(
        page.getByRole('heading', { name: 'Tutor guidelines in effect' })
      ).toBeVisible();

      await expect(
        page.getByTestId('tutor-guideline-layer-universal')
      ).toContainText('Always on');
      await expect(
        page.getByTestId('tutor-guideline-layer-course')
      ).toContainText('Coach AP Lit prose analysis against the 6-point rubric.');
      await expect(
        page.getByTestId('tutor-guideline-layer-module')
      ).toContainText('Not set');
    } finally {
      if (assignmentTypeId) {
        await prisma.assignmentModule.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.organizationAssignmentType.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.assignmentType.deleteMany({
          where: { id: assignmentTypeId },
        });
      }
      await prisma.$disconnect();
    }
  });
});
