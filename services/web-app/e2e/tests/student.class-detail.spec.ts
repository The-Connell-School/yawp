import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

const STUDENT_PASSWORD = 'johndoe';

test.describe.serial('Student class detail', () => {
  test('clicking a class card on the dashboard opens that class', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      const { assignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title: 'E2E Class Detail Assignment',
        prompt: 'Explain what makes a claim arguable.',
      });

      try {
        await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
        await page.goto('/app');
        await expect(page.getByTestId('app._index')).toBeVisible();

        await page
          .locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
          .first()
          .click();

        await page.waitForURL(`**/app/my-classes/${e2eContext.classId}`);
        await expect(page.getByTestId('student-class-detail')).toBeVisible();

        // The class's assignments, not the flat My Documents list.
        await expect(
          page.getByRole('button', { name: /E2E Class Detail Assignment/i })
        ).toBeVisible({ timeout: 10000 });

        // The same "Write something new" entry point as the dashboard, with
        // options inherited from the teacher's enabled assignment types.
        await page
          .getByRole('button', { name: 'Write something new' })
          .click();
        await expect(
          page.getByRole('menuitem', { name: 'E2E Course' })
        ).toBeVisible();
        await page.keyboard.press('Escape');

        await expect(page.getByText('Documents', { exact: true })).toBeVisible();

        // Nothing from the teacher's class page leaks onto the student view.
        await expect(page.getByRole('button', { name: 'Edit Class' })).toHaveCount(
          0
        );
        await expect(page.getByTestId('class-detail-header')).toHaveCount(0);
      } finally {
        await prisma.assignment.delete({ where: { id: assignment.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('a class the student is not enrolled in is refused', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = `cd-${Date.now()}`;
    try {
      const otherClass = await prisma.class.create({
        data: {
          code: `E2E-${suffix}`.slice(0, 32),
          schoolYear: '2024-2025',
          period: '4th',
          grade: '11th',
          title: `Someone else's class ${suffix}`,
          schoolId: e2eContext.schoolId,
        },
        select: { id: true },
      });

      try {
        await signIn(e2eContext.userEmail, STUDENT_PASSWORD);

        const response = await page.goto(
          `/app/my-classes/${otherClass.id}`
        );

        expect(response?.status()).toBe(404);
        await expect(page.getByTestId('student-class-detail')).toHaveCount(0);
        await expect(
          page.getByText(`Someone else's class ${suffix}`)
        ).toHaveCount(0);
      } finally {
        await prisma.class.delete({ where: { id: otherClass.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});
