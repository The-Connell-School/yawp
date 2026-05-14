import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Teacher dashboard assignment types', () => {
  test('renders assignment types, class status, detail navigation, and dashboard assignment creation', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('heading', { name: 'Assignment Types' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'E2E Course' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Classes at a Glance' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Grade 9th .* Period 1st/ })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'E2E Course' })
    ).toHaveAttribute(
      'href',
      `/app/assignment-types/${e2eContext.assignmentTypeId}`
    );

    await page.getByRole('link', { name: 'E2E Course' }).click();
    await page.waitForURL(
      `**/app/assignment-types/${e2eContext.assignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'E2E Course' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^New/ })).toBeVisible();

    await page.getByRole('link', { name: /Back to dashboard/i }).click();
    await page.waitForURL('**/app');

    const title = `Dashboard E2E Assignment ${Date.now()}`;
    const prompt = `Dashboard E2E prompt ${Date.now()}`;
    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/Grade 9th .* Period 1st/).check();
    await page.getByLabel('Title (optional)').fill(title);
    await page.getByLabel('Prompt').fill(prompt);
    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByTestId('teacher-assignments-list').getByText(title)
    ).toBeVisible();

    const prisma = createE2EPrismaClient();
    try {
      const created = await prisma.assignment.findFirst({
        where: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.assignmentTypeId,
          prompt,
        },
        select: { id: true, title: true },
      });
      expect(created?.title).toBe(title);
    } finally {
      await prisma.$disconnect();
    }
  });
});
