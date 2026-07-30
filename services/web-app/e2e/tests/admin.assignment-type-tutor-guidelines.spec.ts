import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

// The universal tutor guidelines are the overarching layer of an assignment
// type's Tutor settings: one box for the whole course, sitting above the
// module-by-module instructions, which stay exactly as they were.
test.describe.serial('Admin assignment type tutor guidelines', () => {
  test.setTimeout(60_000);

  test('edits the course-level guidelines above the module settings', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const guidelines =
      'You are the YAWP! Tutor. Never write the student’s work for them.';

    try {
      await prisma.assignmentType.update({
        where: { id: e2eContext.assignmentTypeId },
        data: { archivedAt: null, tutorInstructions: null },
      });

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(
        `/app/admin/assignment-types/${e2eContext.assignmentTypeId}`
      );
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();

      const tutorSettings = page
        .getByRole('heading', { name: 'Tutor settings' })
        .locator('xpath=ancestor::section');
      const guidelinesBox = tutorSettings.getByLabel(
        'Universal tutor guidelines'
      );
      // The per-module settings are still there, underneath the overarching box.
      const moduleSettings = tutorSettings.getByText(
        'Configure module instructions and rubric relationships for tutor guidance.'
      );
      await expect(guidelinesBox).toBeVisible();
      await expect(moduleSettings).toBeVisible();

      const guidelinesTop = (await guidelinesBox.boundingBox())?.y ?? 0;
      const moduleSettingsTop = (await moduleSettings.boundingBox())?.y ?? 0;
      expect(guidelinesTop).toBeLessThan(moduleSettingsTop);

      await page.getByLabel('Universal tutor guidelines').fill(guidelines);
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByRole('button', { name: 'Update' })).toBeDisabled();

      const saved = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: e2eContext.assignmentTypeId },
        select: { tutorInstructions: true },
      });
      expect(saved.tutorInstructions).toBe(guidelines);

      await page.reload();
      await expect(page.getByLabel('Universal tutor guidelines')).toHaveValue(
        guidelines
      );
    } finally {
      await prisma.assignmentType.update({
        where: { id: e2eContext.assignmentTypeId },
        data: { tutorInstructions: null },
      });
      await prisma.$disconnect();
    }
  });
});
