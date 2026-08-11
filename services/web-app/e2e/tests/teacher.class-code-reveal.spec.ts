import { test, expect } from '../test-setup';

test.describe('Class code reveal', () => {
  test('teacher can open the class code full screen and copy it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => {});
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);

    const trigger = page.getByTestId('class-code-trigger');
    await expect(trigger).toContainText(e2eContext.classCode);
    await trigger.click();

    const display = page.getByTestId('class-code-display');
    await expect(display).toHaveText(e2eContext.classCode);

    const fontSize = await display.evaluate(
      (el) => Number.parseFloat(getComputedStyle(el).fontSize) || 0
    );
    expect(fontSize).toBeGreaterThan(60);

    // Nothing behind the display is readable: the panel covers the whole
    // viewport and is fully opaque, so class data cannot be projected to
    // students by accident.
    const panel = page.getByTestId('class-code-panel');
    const coverage = await panel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        backgroundColor: style.backgroundColor,
      };
    });

    expect(coverage.left).toBeLessThanOrEqual(0);
    expect(coverage.top).toBeLessThanOrEqual(0);
    expect(coverage.width).toBeGreaterThanOrEqual(coverage.viewportWidth);
    expect(coverage.height).toBeGreaterThanOrEqual(coverage.viewportHeight);
    expect(coverage.backgroundColor).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\)/);

    // Only the eyebrow, the code, the copy button and the close button.
    await expect(page.getByTestId('class-code-panel')).toContainText(
      'Class code'
    );
    await expect(
      panel.getByRole('button', { name: /copy code/i })
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: /close/i })).toBeVisible();

    await page.getByRole('button', { name: 'Copy code' }).click();
    await expect(page.getByText('Copied', { exact: false })).toBeVisible();

    // The X button closes it.
    await panel.getByRole('button', { name: /close/i }).click();
    await expect(display).toHaveCount(0);

    await trigger.click();
    await expect(page.getByTestId('class-code-display')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('class-code-display')).toHaveCount(0);
  });
});
