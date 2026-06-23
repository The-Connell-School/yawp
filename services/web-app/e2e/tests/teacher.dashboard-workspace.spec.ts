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
    const created = await prisma.classAssignment.findFirst({
      where: {
        classId: params.classId,
        assignment: {
          assignmentTypeId: params.assignmentTypeId,
          prompt: params.prompt,
          title: params.title,
        },
      },
      select: {
        assignment: {
          select: {
            id: true,
            title: true,
            submitForGrade: true,
            pointValue: true,
          },
        },
      },
    });
    expect(created?.assignment.title).toBe(params.title);
    expect(created?.assignment.submitForGrade).toBe(true);
    expect(created?.assignment.pointValue).toBe(params.pointValue);
  } finally {
    await prisma.$disconnect();
  }
}

async function createSecondTeacherClass(params: {
  schoolId: string;
  teacherMembershipId: string;
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
        teachers: { connect: { id: params.teacherMembershipId } },
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
    const created = await prisma.classAssignment.findMany({
      where: {
        classId: { in: params.classIds },
        assignment: {
          assignmentTypeId: params.assignmentTypeId,
          prompt: params.prompt,
          title: params.title,
        },
      },
      select: {
        classId: true,
        assignment: {
          select: {
            submitForGrade: true,
            pointValue: true,
          },
        },
      },
      orderBy: { classId: 'asc' },
    });

    expect(created.map((deployment) => deployment.classId).sort()).toEqual(
      [...params.classIds].sort()
    );
    for (const deployment of created) {
      expect(deployment.assignment.submitForGrade).toBe(true);
      expect(deployment.assignment.pointValue).toBe(params.pointValue);
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

async function deleteAssignmentsByTitle(title: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.assignment.deleteMany({ where: { title } });
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

    const assignmentsGrid = page.getByTestId('teacher-assignments-grid');
    await expect(
      assignmentsGrid.getByRole('heading', { name: 'Assignments' })
    ).toBeVisible();
    await expect(
      assignmentsGrid.getByRole('button', { name: /new assignment/i })
    ).toBeVisible();

    const gradingGrid = page.getByTestId('teacher-grading-grid');
    await expect(
      gradingGrid.getByRole('heading', { name: 'Grading' })
    ).toBeVisible();
    await expect(
      page.getByTestId('teacher-workspace-cards')
    ).toHaveAttribute(
      'href',
      '/app/documents?status=needs-grading&group=student'
    );
    const toGradeBox = await gradingGrid
      .getByText('To grade', { exact: true })
      .boundingBox();
    const byStudentBox = await gradingGrid
      .getByRole('link', { name: /By student/i })
      .boundingBox();
    expect(toGradeBox).not.toBeNull();
    expect(byStudentBox).not.toBeNull();
    expect(toGradeBox!.y).toBeLessThan(byStudentBox!.y);

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

    const sidebarMyClasses = page
      .locator('nav')
      .getByRole('link', { name: 'My Classes', exact: true });
    await expect(
      page.locator('nav').getByRole('link', { name: 'Dashboard', exact: true })
    ).not.toHaveAttribute('aria-current', 'page');
    await expect(sidebarMyClasses).toHaveAttribute('aria-current', 'page');
  });

  test('only highlights My Classes after visiting grading from the dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('teacher-workspace-cards').click();
    await page.waitForURL(/\/app\/documents/);

    await page
      .locator('nav')
      .getByRole('link', { name: 'My Classes', exact: true })
      .click();
    await page.waitForURL('**/app/my-classes**');

    const sidebarMyClasses = page
      .locator('nav')
      .getByRole('link', { name: 'My Classes', exact: true });
    await expect(
      page.locator('nav').getByRole('link', { name: 'Dashboard', exact: true })
    ).not.toHaveAttribute('aria-current', 'page');
    await expect(sidebarMyClasses).toHaveAttribute('aria-current', 'page');
  });

  test('creates an assignment from the dashboard without leaving the page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const title = `Dashboard Quick Create ${Date.now()}`;
    const prompt = `Dashboard quick-create prompt ${Date.now()}`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      await page
        .getByTestId('teacher-assignments-grid')
        .getByLabel('New E2E Course assignment')
        .click();
      await expectStandardizedAssignmentForm(page);

      await page.getByLabel(CLASS_LABEL).check();
      await page.getByLabel('Title (optional)').fill(title);
      await page.getByLabel('Prompt').fill(prompt);
      await page.getByLabel(/point value/i).fill('25');
      await page.getByRole('button', { name: 'Create Assignment' }).click();

      await expect(page).toHaveURL(
        (url) => url.pathname === '/app' && url.search === ''
      );
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('app._index')).toBeVisible();
      await expect(page.getByTestId('teacher-assignments-grid')).toBeVisible();

      await expectCreatedAssignment({
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        prompt,
        title,
        pointValue: 25,
      });
    } finally {
      await deleteAssignmentsByTitle(title);
    }
  });

  test('opens the shared create sheet from the dashboard New assignment button', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    await page
      .getByTestId('teacher-assignments-grid')
      .getByRole('button', { name: /new assignment/i })
      .click();
    await expectStandardizedAssignmentForm(page);
    await expect(page).toHaveURL(
      (url) => url.pathname === '/app' && url.search === ''
    );
  });

  test('creates one assignment record for each selected class from the Assignments page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const secondClass = await createSecondTeacherClass({
      schoolId: e2eContext.schoolId,
      teacherMembershipId: e2eContext.teacherMembershipId,
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
