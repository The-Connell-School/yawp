import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import {
  devToolsPanel,
  openDevPanelClassSimulationFlyout,
} from '../helpers/dev-panel-feedback';
import { ensureDemoDevTeacherSession } from '../helpers/dev-panel-preview-access';

const prisma = createE2EPrismaClient();

test.describe('Dev panel class simulation', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('populate adds simulated students visible on the class roster', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await ensureDemoDevTeacherSession(page, '/app/my-classes');

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
    const panel = devToolsPanel(page);
    await panel
      .getByRole('listbox', { name: 'Class' })
      .getByRole('option')
      .filter({ hasText: klass!.title! })
      .click();
    await panel.locator('#dev-panel-sim-count').fill('3');
    await panel.getByRole('button', { name: 'Populate class', exact: true }).click();
    await expect(page.getByText(/Added 3 students/i)).toBeVisible({ timeout: 60_000 });

    await page.goto(`/app/my-classes/${klass!.id}?tab=students`);
    await expect(page.getByText('Alex Rivera')).toBeVisible({ timeout: 30_000 });

    await openDevPanelClassSimulationFlyout(page);
    const panelAgain = devToolsPanel(page);
    await panelAgain
      .getByRole('listbox', { name: 'Class' })
      .getByRole('option')
      .filter({ hasText: klass!.title! })
      .click();
    await expect(panelAgain.getByText('Loading your classes…')).toHaveCount(0, {
      timeout: 30_000,
    });
    const clearSimulated = panelAgain.getByRole('button', {
      name: 'Clear simulated data',
      exact: true,
    });
    await expect(clearSimulated).toBeEnabled({ timeout: 60_000 });
    await clearSimulated.click();
    await expect(
      panelAgain.getByRole('group', { name: 'Confirm clear' })
    ).toBeVisible();
    const clearPost = page.waitForResponse(
      (response) =>
        response.url().includes('/api/dev-panel/class-simulation') &&
        response.request().method() === 'POST'
    );
    await panelAgain.getByRole('button', { name: 'Clear', exact: true }).click();
    expect((await clearPost).ok()).toBeTruthy();
    await expect(
      panelAgain.locator('.yawp-dev-panel-class-sim-success')
    ).toContainText(/Cleared 3 simulated students/i, { timeout: 60_000 });
    await page.goto(`/app/my-classes/${klass!.id}?tab=students`);
    await expect(page.getByText('Alex Rivera')).toHaveCount(0);
  });
});
