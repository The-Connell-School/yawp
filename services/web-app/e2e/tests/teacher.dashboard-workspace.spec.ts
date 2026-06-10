import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { Page } from '@playwright/test';

const CLASS_LABEL = /Grade 9th .* Period 1st/;

async function expectStandardizedAssignmentForm(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Assignment type', { exact: true })
  ).toBeVisible();
  await expect(dialog.getByText('Assign to', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('Prompt Source', { exact: true })
  ).toBeVisible();
  await expect(dialog.getByLabel(/tutor context/i)).toHaveCount(0);
  await expect(
    dialog.getByRole('checkbox', { name: /submit for grade/i })
  ).toBeChecked();
  await expect(dialog.getByLabel(/point value/i)).toHaveValue('100');
}

async function expectCreatedAssignment(params: {
  classId: string;
  assignmentTypeId: string;
  prompt: string;
  title: string;
  pointValue: number;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const created = await prisma.assignment.findFirst({
      where: {
        classId: params.classId,
        assignmentTypeId: params.assignmentTypeId,
        prompt: params.prompt,
      },
      select: {
        id: true,
        title: true,
        tutorContext: true,
        submitForGrade: true,
        pointValue: true,
      },
    });
    expect(created?.title).toBe(params.title);
    expect(created?.tutorContext).toBeNull();
    expect(created?.submitForGrade).toBe(true);
    expect(created?.pointValue).toBe(params.pointValue);
  } finally {
    await prisma.$disconnect();
  }
}

async function createSecondTeacherClass(params: {
  schoolId: string;
  teacherProfileId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.class.create({
      data: {
        code: `E2E-MULTI-${Date.now()}`,
        schoolYear: '2024-2025',
        period: '2nd',
        grade: '10th',
        title: 'E2E Multi-Class Proof',
        schoolId: params.schoolId,
        teachers: { connect: { id: params.teacherProfileId } },
      },
      select: { id: true, title: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function expectCreatedAssignmentsForClasses(params: {
  classIds: string[];
  assignmentTypeId: string;
  prompt: string;
  title: string;
  pointValue: number;
}) {
  const prisma = createE2EPrismaClient();
  try {
    const created = await prisma.assignment.findMany({
      where: {
        assignmentTypeId: params.assignmentTypeId,
        prompt: params.prompt,
        title: params.title,
      },
      select: {
        classId: true,
        tutorContext: true,
        submitForGrade: true,
        pointValue: true,
      },
      orderBy: { classId: 'asc' },
    });

    expect(created.map((assignment) => assignment.classId).sort()).toEqual(
      [...params.classIds].sort()
    );
    for (const assignment of created) {
      expect(assignment.tutorContext).toBeNull();
      expect(assignment.submitForGrade).toBe(true);
      expect(assignment.pointValue).toBe(params.pointValue);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteAssignmentsAndClass(params: {
  assignmentTitle: string;
  classId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.assignment.deleteMany({
      where: { title: params.assignmentTitle },
    });
    await prisma.class.delete({ where: { id: params.classId } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Teacher dashboard workspace', () => {
  test('presents classes first with Assignments and Grading entry points', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    // Classes first.
    const classesGrid = page.getByTestId('teacher-classes-grid');
    await expect(classesGrid).toBeVisible();
    await expect(
      classesGrid.getByRole('heading', { name: 'My Classes' })
    ).toBeVisible();
    await expect(classesGrid.getByText(CLASS_LABEL)).toBeVisible();

    // Workspace entry points below.
    const workspaceCards = page.getByTestId('teacher-workspace-cards');
    await expect(
      workspaceCards.getByRole('heading', { name: 'Assignments' })
    ).toBeVisible();
    await expect(
      workspaceCards.getByRole('heading', { name: 'Grading' })
    ).toBeVisible();
    await expect(
      workspaceCards.getByRole('link', { name: /assignments/i })
    ).toHaveAttribute('href', '/app/assignments');
    await expect(
      workspaceCards.getByRole('link', { name: /grading/i })
    ).toHaveAttribute('href', /\/app\/student-work/);

    // Retired dashboard sections stay gone.
    await expect(
      page.getByRole('heading', { name: 'Assignment Types' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: "Teacher's Lounge" })
    ).toHaveCount(0);

    // Clicking a class card opens the class.
    await classesGrid.getByText(CLASS_LABEL).first().click();
    await page.waitForURL(`**/app/my-classes/${e2eContext.classId}**`);
  });

  test('creates one assignment record for each selected class from the Assignments page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const secondClass = await createSecondTeacherClass({
      schoolId: e2eContext.schoolId,
      teacherProfileId: e2eContext.teacherProfileId,
    });
    const title = `Multi-Class E2E Assignment ${Date.now()}`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');

      const prompt = `Multi-Class E2E prompt ${Date.now()}`;
      await page
        .getByRole('button', { name: /new assignment/i })
        .first()
        .click();
      await expectStandardizedAssignmentForm(page);
      await page.getByLabel(CLASS_LABEL).check();
      await page.getByLabel(secondClass.title!).check();
      await page.getByLabel('Title (optional)').fill(title);
      await page.getByLabel('Prompt').fill(prompt);
      await page.getByLabel(/point value/i).fill('35');
      await page.getByRole('button', { name: 'Create Assignment' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expectCreatedAssignmentsForClasses({
        classIds: [e2eContext.classId, secondClass.id],
        assignmentTypeId: e2eContext.assignmentTypeId,
        prompt,
        title,
        pointValue: 35,
      });
    } finally {
      await deleteAssignmentsAndClass({
        assignmentTitle: title,
        classId: secondClass.id,
      });
    }
  });

  test('creates an assignment from the assignment type page shared form', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/assignment-types/${e2eContext.assignmentTypeId}`);
    await expect(
      page.getByRole('heading', { name: 'E2E Course' })
    ).toBeVisible();

    const title = `Type Page E2E Assignment ${Date.now()}`;
    const prompt = `Type Page E2E prompt ${Date.now()}`;
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expectStandardizedAssignmentForm(page);
    await page.getByLabel(CLASS_LABEL).check();
    await page.getByLabel('Title (optional)').fill(title);
    await page.getByLabel('Prompt').fill(prompt);
    await page.getByLabel(/point value/i).fill('40');
    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expectCreatedAssignment({
      classId: e2eContext.classId,
      assignmentTypeId: e2eContext.assignmentTypeId,
      prompt,
      title,
      pointValue: 40,
    });
  });
});
