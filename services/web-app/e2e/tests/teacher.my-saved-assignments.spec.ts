import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const CLASS_LABEL = /Grade 9th .* Period 1st/;

async function deleteSavedAssignmentsAndAssignments(params: {
  title: string;
  prompt: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.savedAssignment.deleteMany({
      where: { prompt: params.prompt },
    });
    await prisma.assignment.deleteMany({ where: { title: params.title } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('My Saved Assignments', () => {
  test('teacher keeps an assignment, reuses it pre-filled, then removes it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const stamp = Date.now();
    const title = `Saved Assignment ${stamp}`;
    const prompt = `Saved assignment prompt ${stamp}`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

      // The saved list starts empty and says so.
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('heading', { name: 'My Saved Assignments' })
      ).toBeVisible();

      // Create an assignment and ask for it to be kept.
      await page.goto('/app');
      await page.waitForLoadState('networkidle');
      await page
        .getByTestId('teacher-assignments-grid')
        .getByRole('button', { name: /new assignment/i })
        .click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(CLASS_LABEL).check();
      await dialog.getByLabel('Title (optional)').fill(title);
      await dialog.getByLabel('Prompt', { exact: true }).fill(prompt);
      await dialog.getByLabel(/point value/i).fill('25');
      await dialog
        .getByRole('checkbox', { name: 'Save to My Saved Assignments' })
        .check();
      await dialog.getByRole('button', { name: 'Create Assignment' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // It is now in the saved list, separate from the assigned table.
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');
      const savedList = page.getByTestId('saved-assignments-list');
      await expect(savedList.getByText(title)).toBeVisible();

      // Reusing it reopens the creation sheet carrying the whole configuration.
      await savedList
        .getByRole('button', { name: 'Give to a class' })
        .first()
        .click();
      const reuseDialog = page.getByRole('dialog');
      await expect(reuseDialog).toBeVisible();
      await expect(reuseDialog.getByLabel('Title (optional)')).toHaveValue(
        title
      );
      await expect(
        reuseDialog.getByLabel('Prompt', { exact: true })
      ).toHaveValue(prompt);
      await expect(reuseDialog.getByLabel(/point value/i)).toHaveValue('25');
      await reuseDialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Removing it takes it off the list without touching what was assigned.
      await savedList.getByRole('button', { name: 'Remove' }).first().click();
      await expect(savedList.getByText(title)).toHaveCount(0);
      await expect(
        page.getByRole('cell', { name: title })
      ).toBeVisible();
    } finally {
      await deleteSavedAssignmentsAndAssignments({ title, prompt });
    }
  });

  test('an assignment created without the checkbox is not kept', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const stamp = Date.now();
    const title = `Unsaved Assignment ${stamp}`;
    const prompt = `Unsaved assignment prompt ${stamp}`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app');
      await page.waitForLoadState('networkidle');
      await page
        .getByTestId('teacher-assignments-grid')
        .getByRole('button', { name: /new assignment/i })
        .click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(CLASS_LABEL).check();
      await dialog.getByLabel('Title (optional)').fill(title);
      await dialog.getByLabel('Prompt', { exact: true }).fill(prompt);
      await expect(
        dialog.getByRole('checkbox', { name: 'Save to My Saved Assignments' })
      ).not.toBeChecked();
      await dialog.getByRole('button', { name: 'Create Assignment' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByTestId('saved-assignments-list').getByText(title)
      ).toHaveCount(0);
    } finally {
      await deleteSavedAssignmentsAndAssignments({ title, prompt });
    }
  });
});
