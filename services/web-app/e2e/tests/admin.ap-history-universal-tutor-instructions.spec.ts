import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { UNIVERSAL_TUTOR_INSTRUCTIONS } from '../../../../packages/prisma/scripts/universal-tutor-instructions';

test.describe.serial('AP History universal tutor instructions', () => {
  test('admin sees the universal tutor block in the AP History tutor settings', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();

    try {
      const module = await prisma.assignmentModule.findFirst({
        where: {
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
          deletedAt: null,
        },
        orderBy: { position: 'asc' },
        select: { id: true, tutorInstructions: true },
      });

      expect(module).not.toBeNull();
      expect(module!.tutorInstructions).toBe(UNIVERSAL_TUTOR_INSTRUCTIONS);

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(
        `/app/admin/assignment-types/${e2eContext.apHistoryAssignmentTypeId}/modules/${module!.id}`
      );

      await expect(
        page.getByRole('heading', { name: 'Module Details' })
      ).toBeVisible();
      await expect(page.getByText('No instructions')).toHaveCount(0);

      // The read-only summary truncates long tutor instructions at 200 chars and
      // exposes a "See more" affordance that opens the editable module sheet.
      await page.getByRole('button', { name: 'See more' }).click();

      const moduleSheet = page.getByRole('dialog').filter({
        has: page.getByRole('heading', { name: 'Edit Module' }),
      });
      await expect(moduleSheet.getByLabel('Tutor Instructions')).toHaveValue(
        UNIVERSAL_TUTOR_INSTRUCTIONS
      );
    } finally {
      await prisma.$disconnect();
    }
  });
});
