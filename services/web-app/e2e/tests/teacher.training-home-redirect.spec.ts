import { expect, test } from '../test-setup';

test.describe('legacy Teacher Courses URLs', () => {
  test('redirect teacher-trainings and teacher-courses to the dashboard', async ({
    page,
  }) => {
    await page.request.post('/auth/dev-login', {
      form: { email: 'dev.teacher@yawp.local' },
    });

    for (const path of ['/app/teacher-trainings', '/app/teacher-courses']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/app$/);
    }
  });
});