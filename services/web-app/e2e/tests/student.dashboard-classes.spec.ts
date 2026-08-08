import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const STUDENT_EMAIL = 'jdoe@brock.software';
const STUDENT_PASSWORD = 'johndoe';
const CLASS_LABEL = /Grade 9th .* Period 1st/;

test.describe.serial('Student dashboard: Classes, not Courses', () => {
  test('dashboard shows a Classes section (not Courses) listing the student\'s enrolled class, with no Courses tab', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(STUDENT_EMAIL);
    await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL('**/app**', { timeout: 15000 });

    await expect(page.getByText('Classes', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(CLASS_LABEL).first()).toBeVisible();

    // The old Courses/Assignments tab switcher is gone.
    await expect(page.getByRole('tab', { name: /^Courses/ })).toHaveCount(0);
  });

  test('My Classes sidebar entry returns the student to their enrolled classes', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(STUDENT_EMAIL);
    await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL('**/app**', { timeout: 15000 });

    await page.getByRole('link', { name: 'My Classes' }).click();
    await page.waitForURL('**/app/my-classes**');
    await expect(page.getByText(CLASS_LABEL).first()).toBeVisible();
  });

  test('My Documents sidebar entry shows the student\'s documents organized by class', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(STUDENT_EMAIL);
    await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL('**/app**', { timeout: 15000 });

    await page.getByRole('link', { name: 'My Documents' }).click();
    await page.waitForURL('**/app/my-documents**');
    await expect(page.getByTestId('app.my-documents._index')).toBeVisible();
  });

  test('"Write something new" lets the student pick an available assignment type and start it', async ({
    page,
    e2eContext,
  }) => {
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(STUDENT_EMAIL);
    await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL('**/app**', { timeout: 15000 });

    await page.getByRole('button', { name: 'Write something new' }).click();
    await page.getByRole('menuitem', { name: 'E2E Course' }).click();
    await page.waitForURL(
      `**/app/assignment-types/${e2eContext.assignmentTypeId}**`
    );
  });

  test('Writing Practice is hidden from the sidebar when the org flag is off, and reachable once enabled', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: false },
      });

      await page.goto('/auth/login');
      await page.locator('input[type="email"]').fill(STUDENT_EMAIL);
      await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL('**/app**', { timeout: 15000 });

      await expect(
        page.getByRole('link', { name: 'Writing Practice' })
      ).toHaveCount(0);

      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: true },
      });

      await page.reload();
      await page.getByRole('link', { name: 'Writing Practice' }).click();
      await page.waitForURL('**/app/writing-lessons**');
    } finally {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: false },
      });
    }
  });
});
