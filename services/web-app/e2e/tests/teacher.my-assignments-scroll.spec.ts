import { test, expect } from '../test-setup';
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
      await page.getByTestId('my-assignments-search').fill('Scroll regression');
      const scroll = page
        .getByRole('heading', { name: 'My Assignments', exact: true })
        .locator('..');
      const nav = page.getByRole('link', {
        name: 'My Assignments',
        exact: true,
      });
      const before = await nav.boundingBox();
      await expect
        .poll(() => scroll.evaluate((el) => el.scrollHeight > el.clientHeight))
        .toBe(true);
      await scroll.hover();
      await page.mouse.wheel(0, 5000);
      await expect
        .poll(() => scroll.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      await expect(
        page.getByTestId(`my-assignment-open-${ids[19]}`)
      ).toBeInViewport();
      const after = await nav.boundingBox();
      expect(after?.y).toBe(before?.y);
      // The remaining ten rows stay reachable through the existing pagination.
      await page.getByRole('button', { name: 'go forward' }).click();
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(
        page.getByTestId(`my-assignment-open-${ids[29]}`)
      ).toBeInViewport();
    }
  } finally {
    await prisma.classAssignment.deleteMany({
      where: { assignmentId: { in: ids } },
    });
    await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
