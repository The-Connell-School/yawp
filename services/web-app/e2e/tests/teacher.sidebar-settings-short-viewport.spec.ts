import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';

async function prepareMaxTeacherNav(organizationId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { writingPracticeEnabled: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function expectSettingsRowInViewport(page: import('@playwright/test').Page) {
  const settingsRow = page.getByText('Settings', { exact: true });
  await expect(settingsRow).toBeVisible();
  const box = await settingsRow.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

test.describe('App sidebar on short desktop viewports', () => {
  test.beforeEach(async ({ e2eContext }) => {
    await prepareMaxTeacherNav(e2eContext.organizationId);
  });

  for (const viewport of [
    { width: 700, height: 480 },
    { width: 1280, height: 600 },
  ] as const) {
    test(`teacher can open Settings and log out at ${viewport.width}x${viewport.height}`, async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.setViewportSize(viewport);
      await page.goto('/app');

      const navLinks = page.locator(
        '[data-tour="app-nav"] .overflow-y-auto a[href^="/app"]'
      );
      await expect(navLinks).toHaveCount(9);

      await expectSettingsRowInViewport(page);

      await page.getByText('Settings', { exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Logout', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Logout', exact: true }).click();
      await page.waitForURL('**/auth/login');
    });
  }

  test('collapsed nav keeps Settings reachable at 700x480', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 700, height: 480 });
    await page.goto('/app');
    await page
      .getByRole('button', { name: 'Collapse app navigation' })
      .click();

    const settingsTrigger = page.locator('[data-tour="app-nav"] .border-t');
    await expect(settingsTrigger).toBeVisible();
    const box = await settingsTrigger.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    await settingsTrigger.click({ force: true });
    await expect(
      page.getByRole('button', { name: 'Logout', exact: true })
    ).toBeVisible();
  });
});
