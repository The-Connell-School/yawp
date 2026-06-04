import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin grading assistants', () => {
  test('creates a template and links an assignment type default', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const templateName = `E2E ACT Template ${suffix}`;
    const templateSlug = `e2e-act-template-${suffix}`;

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/grading-assistants');
      await expect(
        page.getByRole('heading', { name: 'Grading assistant templates' })
      ).toBeVisible();
      await expect(
        page.getByText('Thesis-driven essay grading assistant')
      ).toBeVisible();

      await page.getByRole('button', { name: 'New Template' }).click();
      await page.getByLabel('Name').fill(templateName);
      await page.getByLabel('Slug').fill(templateSlug);
      await page.getByLabel('Assignment Type Kind').fill('act_writing');
      await page.getByRole('button', { name: 'Create Draft' }).click();
      await expect(page.getByText(templateName)).toBeVisible();

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
        where: { slug: templateSlug },
      });
      await prisma.$disconnect();
    }
  });
});
