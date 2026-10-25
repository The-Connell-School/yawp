import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { openDevPanelClassSimulationFlyout } from '../helpers/dev-panel-feedback';

const prisma = createE2EPrismaClient();

test.describe('Dev panel class simulation', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('populate adds simulated students visible on the class roster', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.request.post('/auth/dev-login', {
      form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/my-classes' },
    });

    const membership = await prisma.orgMembership.findFirst({
      where: { user: { email: 'dev.teacher@yawp.local' }, role: 'TEACHER' },
      select: { id: true },
    });
    expect(membership).not.toBeNull();
    const klass = await prisma.class.findFirst({
      where: { teachers: { some: { id: membership!.id } }, isArchived: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true },
    });
    test.skip(!klass, 'No owned class for dev teacher');

    await page.goto('/app/my-classes');
    await openDevPanelClassSimulationFlyout(page);
    const simSheet = page.getByRole('dialog', { name: 'Class simulation' });
    const classSelect = simSheet.locator('#dev-panel-simulation-class');
    await expect(classSelect).toBeVisible({ timeout: 30_000 });
    await classSelect.selectOption(klass!.id);
    await simSheet.getByLabel('Student count').fill('3');
    await simSheet.getByRole('button', { name: 'Populate class', exact: true }).click();
    await expect(page.getByText(/Added 3 students/i)).toBeVisible({ timeout: 60_000 });

    await page.goto(`/app/my-classes/${klass!.id}?tab=students`);
    await expect(page.getByText('Alex Rivera')).toBeVisible({ timeout: 30_000 });

    await openDevPanelClassSimulationFlyout(page);
    await simSheet
      .getByRole('button', { name: 'Clear simulated data', exact: true })
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByText(/Cleared 3 simulated/i)).toBeVisible({ timeout: 60_000 });
    await page.goto(`/app/my-classes/${klass!.id}?tab=students`);
    await expect(page.getByText('Alex Rivera')).toHaveCount(0);
  });
});
