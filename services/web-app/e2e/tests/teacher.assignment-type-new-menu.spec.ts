import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';
import { TEACHER_PROMPT_GENERATOR_FLAG } from '~/domain/feature-flags/feature-flags';

// Set NEW_MENU_SHOTS to a directory to save the opened menu for review.
const evidence = process.env.NEW_MENU_SHOTS;

test.describe('Assignment-type New menu', () => {
  test.use({ deviceScaleFactor: evidence ? 2 : 1 });
  // Show every item the menu can hold, including Generate a prompt.
  test.beforeAll(() => setFeatureFlag(TEACHER_PROMPT_GENERATOR_FLAG, true));
  test.afterAll(() => setFeatureFlag(TEACHER_PROMPT_GENERATOR_FLAG, false));

  test('lists Assignment, Generate a prompt, then Sample document', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'Class Starter', level: 1 })
    ).toBeVisible();

    await page.getByRole('button', { name: /^New/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem').first()).toBeVisible();
    if (evidence) {
      mkdirSync(evidence, { recursive: true });
      // Let the menu finish fading in before capturing it.
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(evidence, 'new-menu.png'),
        clip: { x: 640, y: 0, width: 640, height: 240 },
      });
    }

    await expect(menu.getByRole('menuitem')).toHaveText([
      'Assignment',
      'Generate a prompt',
      'Sample document',
    ]);
    await expect(
      menu.getByRole('menuitem', { name: 'Document', exact: true })
    ).toHaveCount(0);

    // The document item still creates a sample document, as before.
    await menu.getByRole('menuitem', { name: 'Sample document' }).click();
    await page.waitForURL(/\/app\/documents\/[^/?]+/);
  });
});
