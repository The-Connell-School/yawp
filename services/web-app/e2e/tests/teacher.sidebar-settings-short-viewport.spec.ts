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
      await expect(navLinks).toHaveCount(8);
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/teacher-trainings"]')
      ).toHaveCount(0);

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

    const settingsTrigger = page.getByTestId('app-nav-settings');
    await expect(settingsTrigger).toBeVisible();
    const box = await settingsTrigger.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    await page.getByTestId('app-nav-settings').click({ force: true });
    await expect(
      page.getByRole('button', { name: 'Logout', exact: true })
    ).toBeVisible();
  });

  test('collapse arrow and labels row toggle, and reload keeps the preference', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app');
    const nav = page.locator('[data-tour="app-nav"]');
    await expect(nav).not.toHaveClass(/items-center/);

    const waitForNavPost = () =>
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/preferences/nav') &&
          res.request().method() === 'POST' &&
          res.ok()
      );

    const collapsed = waitForNavPost();
    await page.getByRole('button', { name: 'Collapse app navigation' }).click();
    await collapsed;
    await expect(nav).toHaveClass(/items-center/);
    await page.reload();
    await expect(nav).toHaveClass(/items-center/);

    await page.locator('.app-nav-collapsed-logo-swap').hover();
    const expand = page.getByRole('button', { name: 'Expand app navigation' });
    await expect(expand).toBeVisible();
    const expanded = waitForNavPost();
    await expand.click();
    await expanded;
    await expect(nav).not.toHaveClass(/items-center/);

    const hidden = waitForNavPost();
    await page.getByRole('button', { name: 'Hide labels' }).click();
    await hidden;
    await expect(nav).toHaveClass(/items-center/);
    await page.reload();
    await expect(nav).toHaveClass(/items-center/);

    const shown = waitForNavPost();
    await page.getByRole('button', { name: 'Show labels' }).click();
    await shown;
    await expect(nav).not.toHaveClass(/items-center/);
    await page.reload();
    await expect(nav).not.toHaveClass(/items-center/);
  });

  test('Need help opens Gmail, mail app, and copy actions', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app');

    await expect(page.locator('a[href="mailto:support@yawp.school"]')).toHaveCount(
      0
    );
    await page.getByRole('button', { name: 'Need help?' }).click();
    const gmail = page.getByTestId('app-nav-need-help-gmail');
    await expect(gmail).toBeVisible();
    await expect(gmail).toHaveAttribute('href', /mail\.google\.com/);
    await expect(gmail).toHaveAttribute('href', /support%40yawp\.school/);
    await expect(gmail).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('app-nav-need-help-mailto')).toHaveAttribute(
      'href',
      'mailto:support@yawp.school'
    );
    await expect(page.getByTestId('app-nav-need-help-mailto')).toHaveText(
      'Open my email app'
    );
    await page.getByTestId('app-nav-need-help-copy').click();
    await expect(page.getByTestId('app-nav-need-help-copy')).toHaveText(
      'Copied!'
    );
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('support@yawp.school');
  });
});
