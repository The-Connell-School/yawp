import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const CLASS_LABEL = /Grade 9th .* Period 1st/;

test('teacher can create a collaborative Daily Pages assignment', async ({
  page,
  e2eContext,
  signIn,
}) => {
  const prisma = createE2EPrismaClient();
  const title = `Collaborative Daily Pages ${Date.now()}`;

  try {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(CLASS_LABEL).check();
    await dialog.getByLabel('Title (optional)').fill(title);
    await dialog
      .getByLabel('Prompt', { exact: true })
      .fill('Write one shared reflection about today’s discussion.');

    const collaborationToggle = dialog.getByRole('checkbox', {
      name: 'Is this a collaborative assignment?',
    });
    await expect(collaborationToggle).toBeVisible();
    await expect(collaborationToggle).not.toBeChecked();
    await collaborationToggle.check();
    await dialog
      .getByRole('button', { name: 'One doc for the whole class' })
      .click();

    await dialog.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page).toHaveURL(/\/app\/class-assignments\/[^/]+\/groups$/);
    await expect(
      page.getByRole('heading', { name: `Groups · ${title}` })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Finalize groups' })
    ).toBeVisible();
  } finally {
    await prisma.assignment.deleteMany({ where: { title } });
    await prisma.$disconnect();
  }
});
