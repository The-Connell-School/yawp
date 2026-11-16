import { test, expect } from '@playwright/test';

test('Pre-writing is the first step of any major essay, including the collapsed preview', async ({ page }) => {
  await page.goto('/e2e/fixtures/brian-fixes/index.html?landing=prewriting');
  const box = page.getByTestId('how-to-teach-spotlight');
  await expect(box).toContainText('Pre-writing is the first step of any major essay assignment.');
  await expect(box).not.toContainText('Lesson 2 of the Thesis-Driven Essay course');
  await page.getByRole('button', { name: 'Hide How to Teach It', exact: true }).click();
  await expect(page.getByTestId('how-to-teach-preview')).toContainText('the first step of any major essay assignment');
});

test('Class Starter homepage names exactly three grading bands', async ({ page }) => {
  await page.goto('/e2e/fixtures/brian-fixes/index.html?landing=class-starter');
  await page.getByRole('button', { name: 'Show How it works', exact: true }).click();
  const box = page.getByTestId('landing-section-how-it-works');
  await expect(box.locator('li strong')).toHaveText(['Full credit:', 'Partial credit:', 'No credit:']);
  await expect(box).not.toContainText(/Absent|Hardly there|Showed up|All in/);
});

for (const width of [1280, 390, 320]) {
  test(`Post to your class buttons contain their labels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/fixtures/brian-fixes/index.html');
    const card = page.getByTestId('post-to-class');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('share-classroom')).toHaveText('Share to Google Classroom');
    for (const id of ['share-copy', 'share-classroom']) {
      const fits = await card.getByTestId(id).evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        const parent = button.closest('section')!.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(button);
        const label = text.getBoundingClientRect();
        return button.scrollWidth <= button.clientWidth + 1
          && label.left >= bounds.left && label.right <= bounds.right + 1
          && label.top >= bounds.top && label.bottom <= bounds.bottom + 1
          && bounds.left >= parent.left && bounds.right <= parent.right;
      });
      expect(fits, `${id} must contain its full label inside the card`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
