import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';
import { PLATFORM_ENHANCEMENTS_FLAG } from '../../app/domain/feature-flags/feature-flags';

// This suite changes only the isolated E2E database. One worker prevents flag races.
test.describe('Platform enhancements', () => {
  test.afterAll(async () => setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false));

  for (const width of [1280, 390]) {
    test(`keeps the old presentation when off (${width}px)`, async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
      );
      if (width === 390)
        await page
          .locator('button')
          .filter({
            has: page.locator(
              'svg path[d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"]'
            ),
          })
          .click();
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveAttribute('width', '20');
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveClass(/lucide-notebook-pen/);
      if (width === 390)
        await page
          .getByRole('button', { name: 'Close app navigation', exact: true })
          .click();
      await expect(
        page.getByRole('button', { name: 'Prompt Library', exact: true })
      ).toHaveAttribute('aria-expanded', 'false');
      await page
        .getByRole('button', { name: 'Prompt Library', exact: true })
        .click();
      await expect(
        page.locator('[data-tour="type-library"] main ul > li')
      ).toHaveCount(100);
      await expect(
        page.getByRole('navigation', { name: 'Prompt library pagination' })
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /assignment/i }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('button', { name: /Advanced/ })).toHaveCount(
        0
      );
      await expect(
        sheet.locator('#assignment-create-submit-for-grade')
      ).toHaveAttribute('role', 'checkbox');
      await expect(
        sheet.getByRole('button', { name: 'Change', exact: true })
      ).toBeVisible();
    });

    test(`regroups the sheet, creates work and pages filtered prompts (${width}px)`, async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
      );
      if (width === 390)
        await page
          .locator('button')
          .filter({
            has: page.locator(
              'svg path[d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"]'
            ),
          })
          .click();
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveClass(/lucide-pen-line/);
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveAttribute('width', '18');
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/reporter"] svg')
      ).toHaveAttribute('width', '18');
      if (width === 390)
        await page
          .getByRole('button', { name: 'Close app navigation', exact: true })
          .click();
      const library = page.locator('[data-tour="type-library"]');
      await expect(
        library.getByRole('button', { name: /Prompt Library/ })
      ).toHaveAttribute('aria-expanded', 'true');
      await expect(library.getByText(/^Showing 1–12 of/)).toBeVisible();
      await expect(library.locator('main ul > li')).toHaveCount(12);
      await library
        .getByRole('button', { name: 'Page 2', exact: true })
        .click();
      await expect(page).toHaveURL(/promptPage=2/);
      await expect(library.getByText(/^Showing 13–24 of/)).toBeVisible();
      if (width === 390)
        await library
          .getByRole('button', { name: 'Filter', exact: true })
          .click();
      const search = page.locator(
        'input[placeholder="Search prompts…"]:visible'
      );
      await search.fill('community');
      await search.press('Enter');
      await expect(page).not.toHaveURL(/promptPage=2/);
      if (width === 390)
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Close', exact: true })
          .click();
      await expect(library.getByText(/^Showing 1–/)).toBeVisible();
      await expect(library.getByText(/^Showing 1–12 of 100$/)).toHaveCount(0);
      await expect(library.locator('main ul > li')).not.toHaveCount(12);
      await library.locator('main ul > li button').first().click();
      const sheet = page.getByRole('dialog');
      await expect(
        sheet.getByRole('heading', { name: 'Basics', exact: true })
      ).toBeVisible();
      await expect(
        sheet.getByRole('heading', { name: 'Prompt', exact: true })
      ).toBeVisible();
      const advanced = sheet.getByRole('button', { name: /Advanced/ });
      await expect(advanced).toHaveAttribute('aria-expanded', 'false');
      await expect(sheet.getByTestId('advanced-summary')).toContainText(
        'Tutor on'
      );
      await advanced.click();
      await expect(
        sheet.getByRole('switch', { name: 'Submit for grade', exact: true })
      ).toBeVisible();
      await expect(
        sheet.getByRole('switch', { name: 'Tutor', exact: true })
      ).toBeVisible();
      await advanced.click();
      expect(
        await sheet.evaluate(
          (element) => element.scrollWidth - element.clientWidth
        )
      ).toBeLessThanOrEqual(0);
      await expect(
        sheet.getByRole('button', { name: 'Create assignment', exact: true })
      ).toBeInViewport();
      await sheet.locator('[id^="assignment-create-class-"]').first().click();
      const title = `Platform enhancements ${width} ${Date.now()}`;
      await sheet.getByLabel('Title', { exact: true }).fill(title);
      await sheet
        .getByRole('button', { name: 'Create assignment', exact: true })
        .click();
      await expect(sheet).not.toBeVisible();
      await page.goto('/app/assignments');
      await expect(
        page.getByRole('link', { name: title, exact: true })
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth
        )
      ).toBeLessThanOrEqual(0);
    });
  }
  test('keeps the lock badge and new icons in the free-account sidebar', async ({
    page,
    signIn,
  }) => {
    await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
    await setFeatureFlag('free_tier', true);
    await setFeatureFlag('free-tier-inapp-v2', true);
    try {
      await signIn('dev.teacher.free@yawp.local', 'yawp-dev');
      await page.goto('/app');
      await expect(page.locator('[data-free-account]')).toHaveCount(1);
      const reporter = page.locator(
        '[data-tour="app-nav"] a[href="/app/reporter"]'
      );
      await expect(reporter.locator('svg.lucide-microscope')).toHaveAttribute(
        'width',
        '18'
      );
      await expect(reporter.locator('svg.lucide-lock')).toHaveAttribute(
        'width',
        '12'
      );
      await expect(
        page.locator('[data-tour="app-nav"] a[href="/app/assignments"] svg')
      ).toHaveClass(/lucide-pen-line/);
    } finally {
      await setFeatureFlag('free-tier-inapp-v2', false);
      await setFeatureFlag('free_tier', false);
    }
  });
});
