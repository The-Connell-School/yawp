import { test, expect } from '../test-setup';
import { fillMyAssignmentsSearch } from '../test-helpers';
import { createE2EPrismaClient } from '../prisma-client';

test('My Assignments scrolls at short and tall viewports while navigation stays fixed', async ({
  page,
  signIn,
  e2eContext,
}) => {
  const prisma = createE2EPrismaClient();
  const ids: string[] = [];
  try {
    for (let index = 0; index < 30; index++) {
      const assignment = await prisma.assignment.create({
        data: {
          title: `Scroll regression ${String(index).padStart(2, '0')}`,
          prompt: 'Scroll fixture',
          assignmentTypeId: e2eContext.assignmentTypeId,
          classAssignments: { create: { classId: e2eContext.classId } },
        },
      });
      ids.push(assignment.id);
    }
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    for (const height of [400, 900]) {
      await page.setViewportSize({ width: 1280, height });
      await page.goto('/app/assignments');
      await fillMyAssignmentsSearch(page, 'Scroll regression');
      const scroll =
        (await page.locator('section.free-tier-b2-page-shell').count()) > 0
          ? page.locator('section.free-tier-b2-page-shell')
          : page
              .getByRole('heading', { name: 'My Assignments', exact: true })
              .locator('..');
      const nav = page.locator('[data-app-shell] > nav').first();
      const before = await nav.boundingBox();
      await expect
        .poll(() => scroll.evaluate((el) => el.scrollHeight > el.clientHeight))
        .toBe(true);
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect
        .poll(() => scroll.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      await expect(
        page.getByTestId(`my-assignment-open-${ids[19]}`)
      ).toBeVisible({ timeout: 15_000 });
      const after = await nav.boundingBox();
      expect(after?.y).toBe(before?.y);
      const forward = page.getByRole('button', { name: 'go forward' });
      await expect(forward).toBeEnabled();
      await forward.click();
      await expect(page.getByText(/Page.*2 of 2/)).toBeVisible({
        timeout: 15_000,
      });
    }
  } finally {
    await prisma.classAssignment.deleteMany({
      where: { assignmentId: { in: ids } },
    });
    await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
