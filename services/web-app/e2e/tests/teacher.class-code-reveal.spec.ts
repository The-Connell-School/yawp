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

    await page.getByRole('button', { name: 'Copy code' }).click();
    await expect(page.getByText('Copied', { exact: false })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(display).toHaveCount(0);
  });
});
