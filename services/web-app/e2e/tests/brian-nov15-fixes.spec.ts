import { test, expect } from '@playwright/test';

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
