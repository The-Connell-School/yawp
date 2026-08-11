import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin class creation: optional period', () => {
  test('creates a class with no period selected', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    // Server caps class codes at 10 alphanumeric characters.
    const code = `NOPER${Date.now().toString().slice(-5)}`;
    let createdClassId: string | null = null;

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/organization/classes');
      await page.getByRole('button', { name: 'Create Class' }).click();

      const sheet = page.getByRole('dialog');
      await expect(
        sheet.getByRole('heading', { name: 'Create Class' })
      ).toBeVisible();

      // School (first combobox in the sheet)
      const comboboxes = sheet.locator('button[role="combobox"]');
      await comboboxes.nth(0).click();
      await page.locator('[role="option"]').first().click();

      await sheet.locator('#code').fill(code);
      await sheet.locator('#schoolYear').fill('2025-2026');

      // Grade (second combobox)
      await comboboxes.nth(1).click();
      await page.getByRole('option', { name: '9', exact: true }).click();

      // Period select defaults to "No period" — leave untouched.
      await expect(comboboxes.nth(2)).toContainText('No period');

      await sheet.getByRole('button', { name: 'Create Class' }).click();
      await expect(sheet).toBeHidden();

      const created = await prisma.class.findFirst({ where: { code } });
      expect(created).not.toBeNull();
      expect(created?.period).toBeNull();
      createdClassId = created?.id ?? null;

      await expect(page.getByRole('cell', { name: code })).toBeVisible();
      const row = page.getByRole('row').filter({ hasText: code });
      await expect(row).toContainText('—');
    } finally {
      if (createdClassId) {
        await prisma.class.delete({ where: { id: createdClassId } });
      }
    }
  });
});
