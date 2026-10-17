import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';
import { PLATFORM_ENHANCEMENTS_FLAG } from '../../app/domain/feature-flags/feature-flags';

// This suite changes only the isolated E2E database. One worker prevents flag races.
test.describe('Platform enhancements', () => {
  test.afterAll(async () => setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false));

  for (const width of [1280, 390]) {
    test(`keeps the old presentation when off (${width}px)`, async ({ page, signIn, e2eContext }) => {
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, false);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);
      await expect(page.getByRole('button', { name: 'Prompt Library', exact: true })).toHaveAttribute('aria-expanded', 'false');
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /assignment/i }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('button', { name: /Advanced/ })).toHaveCount(0);
      await expect(sheet.locator('#assignment-create-submit-for-grade')).toHaveAttribute('role', 'checkbox');
      await expect(sheet.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
    });

    test(`regroups the sheet, creates work and pages filtered prompts (${width}px)`, async ({ page, signIn, e2eContext }) => {
      await setFeatureFlag(PLATFORM_ENHANCEMENTS_FLAG, true);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);
      const library = page.locator('[data-tour="type-library"]');
      await expect(library.getByRole('button', { name: /Prompt Library/ })).toHaveAttribute('aria-expanded', 'true');
      await expect(library.getByText(/^Showing 1–12 of/)).toBeVisible();
      await expect(library.locator('main ul > li')).toHaveCount(12);
      await library.getByRole('button', { name: 'Page 2', exact: true }).click();
      await expect(page).toHaveURL(/promptPage=2/);
      await expect(library.getByText(/^Showing 13–24 of/)).toBeVisible();
      if (width === 390) await library.getByRole('button', { name: 'Filter', exact: true }).click();
      const search = page.getByPlaceholder('Search prompts…').filter({ visible: true });
      await search.fill('community');
      await search.press('Enter');
      await expect(page).not.toHaveURL(/promptPage=2/);
      if (width === 390) await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await expect(library.getByText(/^Showing 1–/)).toBeVisible();
      await library.locator('main ul > li button').first().click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('heading', { name: 'Basics', exact: true })).toBeVisible();
      await expect(sheet.getByRole('heading', { name: 'Prompt', exact: true })).toBeVisible();
      const advanced = sheet.getByRole('button', { name: /Advanced/ });
      await expect(advanced).toHaveAttribute('aria-expanded', 'false');
      await expect(sheet.getByTestId('advanced-summary')).toContainText('Tutor on');
      await advanced.click();
      await expect(sheet.getByRole('switch', { name: 'Submit for grade', exact: true })).toBeVisible();
      await expect(sheet.getByRole('switch', { name: 'Tutor', exact: true })).toBeVisible();
      await advanced.click();
      await sheet.locator('[id^="assignment-create-class-"]').first().click();
      await sheet.getByLabel('Title (optional)').fill(`Platform enhancements ${width}`);
      await sheet.getByRole('button', { name: 'Create assignment', exact: true }).click();
      await expect(sheet).not.toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }
});
