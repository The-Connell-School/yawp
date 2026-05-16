import { expect, test } from '@playwright/test';

test.describe('Public landing page', () => {
  test('centers the writing challenges subtitle under its heading', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1347, height: 768 });
    await page.goto('/');

    const heading = page.getByRole('heading', {
      name: 'The Writing Challenges Schools Face Today',
    });
    const subtitle = page.locator('.yawp-section-intro');

    await expect(heading).toBeVisible();
    await expect(subtitle).toBeVisible();

    const headingBox = await heading.boundingBox();
    const subtitleBox = await subtitle.boundingBox();

    expect(headingBox).not.toBeNull();
    expect(subtitleBox).not.toBeNull();

    const headingCenter = headingBox!.x + headingBox!.width / 2;
    const subtitleCenter = subtitleBox!.x + subtitleBox!.width / 2;

    expect(Math.abs(headingCenter - subtitleCenter)).toBeLessThanOrEqual(2);
  });
});
