import { test, expect } from '@playwright/test';

const LANDING_KEYS = ['thesis-driven-essay', 'class-starter', 'exit-ticket', 'prewriting',
  'thesis-statement', 'daily-pages', 'five-paragraph-essay', 'act-writing', 'welcome-to-yawp'];

for (const width of [1280, 390]) {
  for (const key of LANDING_KEYS) {
    test(`${key} box text is readable in light mode and keeps dark mode at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/e2e/fixtures/brian-fixes/index.html?landing=${key}`);
      const labels = await page.getByRole('button', { name: /^Show / })
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')!));
      for (const name of labels) await page.getByRole('button', { name, exact: true }).click();
      await page.mouse.move(0, 0);
      const muted = page.locator('[data-landing-box] [class*="text-muted-foreground"], [data-landing-box] [class*="text-[#4A4A4A]"]');
      expect(await muted.count()).toBeGreaterThan(0);
      for (const text of await muted.all()) await expect(text).toHaveCSS('color', 'rgb(74, 74, 74)');

      const darkColor = await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        const sample = document.createElement('span');
        sample.style.color = 'hsl(var(--muted-foreground))';
        document.body.appendChild(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      });
      for (const text of await muted.all()) await expect(text).toHaveCSS('color', darkColor);
    });
  }
}

test('at 390px the thesis philosophy box follows How to Teach It outside the course', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/fixtures/brian-fixes/index.html?landing=thesis-driven-essay');
  const boxes = page.locator('[data-landing-box]');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).toHaveAttribute('data-testid', 'how-to-teach-spotlight');
  await expect(boxes.nth(1)).toHaveAttribute('data-testid', 'landing-section-philosophy');
  await expect(page.getByTestId('thesis-essay-course').getByTestId('landing-section-philosophy')).toHaveCount(0);
});

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
