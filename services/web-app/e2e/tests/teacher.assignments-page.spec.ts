import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

async function createAssignment(params: {
  classId: string;
  assignmentTypeId: string;
  title: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const { assignment } = await createDeployedAssignment({
      prisma,
      classId: params.classId,
      assignmentTypeId: params.assignmentTypeId,
      title: params.title,
      prompt: `Prompt for ${params.title}`,
    });
    return assignment;
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteAssignmentsByTitle(title: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.assignment.deleteMany({ where: { title } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Teacher Assignments page', () => {
  test('nav link opens the assignments list with seeded assignment', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    const navLink = page
      .getByRole('navigation')
      .getByRole('link', { name: 'Assignments', exact: true });
    await expect(navLink).toBeVisible();
    await navLink.click();
    await page.waitForURL('**/app/assignments');

    await expect(
      page.getByRole('heading', { name: 'Assignments' })
    ).toBeVisible();
    const row = page.getByRole('row', { name: /E2E Class Assignment/ });
    await expect(row).toBeVisible();
    await expect(row.getByText('E2E Course')).toBeVisible();
    await expect(row.getByText(/Grade 9th .* Period 1st/)).toBeVisible();
    await expect(page.getByText(/assignment preset/i)).toHaveCount(0);
  });

  test('creates an assignment applied to the seeded class', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const title = `Assignments Page Create ${Date.now()}`;
    const prompt = `Assignments page prompt ${Date.now()}`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /new assignment/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText('Assignment type', { exact: true })
      ).toBeVisible();
      await expect(dialog.getByText('Assign to', { exact: true })).toBeVisible();

      await page.getByLabel(/Grade 9th .* Period 1st/).check();
      await page.getByLabel('Title (optional)').fill(title);
      await page.getByLabel('Prompt').fill(prompt);
      await page.getByRole('button', { name: 'Create Assignment' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();

      const prisma = createE2EPrismaClient();
      try {
        const created = await prisma.classAssignment.findFirst({
          where: {
            classId: e2eContext.classId,
            assignment: { title, prompt },
          },
          select: { assignment: { select: { id: true, prompt: true } } },
        });
        expect(created?.assignment.prompt).toBe(prompt);
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      await deleteAssignmentsByTitle(title);
    }
  });

  test('edits an assignment title from the assignments page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const title = `Assignments Page Edit ${Date.now()}`;
    const updatedTitle = `${title} Updated`;

    try {
      await createAssignment({
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title,
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');

      const row = page.getByRole('row', { name: new RegExp(title) });
      await row.getByRole('button', { name: /edit/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Title (optional)').fill(updatedTitle);
      await dialog.getByRole('button', { name: /save assignment/i }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expect(
        page.getByRole('row', { name: new RegExp(updatedTitle) })
      ).toBeVisible();
    } finally {
      await deleteAssignmentsByTitle(title);
      await deleteAssignmentsByTitle(updatedTitle);
    }
  });

  test('duplicate opens a prefilled creation sheet', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const title = `Assignments Page Duplicate ${Date.now()}`;

    try {
      await createAssignment({
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title,
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');

      const row = page.getByRole('row', { name: new RegExp(title) });
      await row.getByRole('button', { name: /duplicate/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Title (optional)')).toHaveValue(
        `Copy of ${title}`
      );
      await expect(dialog.getByLabel('Prompt')).toHaveValue(
        `Prompt for ${title}`
      );
    } finally {
      await deleteAssignmentsByTitle(title);
    }
  });

  test('deleting an assignment keeps the student document', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const title = `Assignments Page Delete ${Date.now()}`;
    const docTitle = `Doc for ${title}`;
    const prisma = createE2EPrismaClient();
    let documentId = '';

    try {
      const { assignment, classAssignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title,
        prompt: `Prompt for ${title}`,
      });
      const document = await prisma.document.create({
        data: {
          title: docTitle,
          text: 'Delete-safety document',
          html: '<p>Delete-safety document</p>',
          membership: { connect: { id: e2eContext.membershipId } },
          assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
          assignment: { connect: { id: assignment.id } },
          classAssignment: { connect: { id: classAssignment.id } },
        },
        select: { id: true },
      });
      documentId = document.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');

      const row = page.getByRole('row', { name: new RegExp(title) });
      page.once('dialog', (dialog) => dialog.accept());
      await row.getByRole('button', { name: /delete/i }).click();

      await expect(
        page.getByRole('row', { name: new RegExp(title) })
      ).toHaveCount(0);

      const remainingAssignment = await prisma.assignment.findFirst({
        where: { title },
      });
      expect(remainingAssignment).toBeNull();
      const survivingDocument = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, assignmentId: true, classAssignmentId: true },
      });
      expect(survivingDocument?.id).toBe(documentId);
      expect(survivingDocument?.assignmentId).toBeNull();
      expect(survivingDocument?.classAssignmentId).toBeNull();
    } finally {
      if (documentId) {
        await prisma.document
          .delete({ where: { id: documentId } })
          .catch(() => {});
      }
      await prisma.assignment.deleteMany({ where: { title } });
      await prisma.$disconnect();
    }
  });
});
