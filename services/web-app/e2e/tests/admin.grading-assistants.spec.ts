import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin grading assistants', () => {
  test('creates a template and edits it on dedicated pages', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const templateName = `E2E ACT Template ${suffix}`;

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/grading-assistants');
      await expect(
        page.getByRole('heading', { name: 'Grading assistants', exact: true })
      ).toBeVisible();

      await page.getByRole('link', { name: 'New grading assistant' }).click();
      await expect(
        page.getByRole('heading', { name: 'New grading assistant' })
      ).toBeVisible();
      await page.getByLabel('Name').fill(templateName);
      await page.getByRole('button', { name: 'Create draft' }).click();

      await expect(page).toHaveURL(/\/app\/admin\/grading-assistants\/.+/);
      await expect(page.getByRole('heading', { name: templateName })).toBeVisible();

      const updatedTemplateName = `${templateName} Edited`;
      await page.getByLabel('Name').fill(updatedTemplateName);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('heading', { name: updatedTemplateName })).toBeVisible();

      await page.goto('/app/admin/grading-assistants');
      await expect(page.getByText(updatedTemplateName)).toBeVisible();

      await page.goto(
        `/app/admin/assignment-types/${e2eContext.assignmentTypeId}`
      );
      await expect(
        page.getByRole('heading', { name: 'Grading Assistant' })
      ).toBeVisible();
      await expect(page.getByText('No active default link')).toBeVisible();

      await page
        .locator('select[name="gradingAssistantTemplateId"]')
        .selectOption('gait_thesis_current_v1');
      await page.getByRole('button', { name: 'Link Default' }).click();
      await expect(
        page.getByText('Thesis-driven essay grading assistant').first()
      ).toBeVisible();

      const activeLink = await prisma.assignmentTypeGradingAssistant.findFirst({
        where: {
          assignmentTypeId: e2eContext.assignmentTypeId,
          gradingAssistantTemplateId: 'gait_thesis_current_v1',
          isDefault: true,
          activeTo: null,
        },
      });
      expect(activeLink).not.toBeNull();
    } finally {
      await prisma.assignmentTypeGradingAssistant.deleteMany({
        where: { assignmentTypeId: e2eContext.assignmentTypeId },
      });
      await prisma.gradingAssistantTemplate.deleteMany({
        where: { name: { startsWith: 'E2E ACT Template' } },
      });
      await prisma.$disconnect();
    }
  });
});
