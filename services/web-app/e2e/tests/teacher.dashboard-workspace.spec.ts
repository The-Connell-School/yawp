import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { currentSchoolYear } from '../../app/utils/school-year';
import type { Page } from '@playwright/test';

const CLASS_LABEL = /Grade 9th .* Period 1st/;
// The creation sheet renders the tutor control as a standard checkbox field: a short
// <Label htmlFor> is the accessible name and the guidance sits in a sibling paragraph,
// which is asserted as visible text in expectStandardizedAssignmentForm below.
const TUTOR_TOGGLE_LABEL = 'Tutor enabled';
const TUTOR_TOGGLE_HELP =
  "Turning the tutor off removes it from students' documents. Do this to test a student's ability to write a paper independently of tutor guidance.";

async function expectStandardizedAssignmentForm(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Assignment type', { exact: true })
  ).toBeVisible();
  await expect(dialog.getByText('Assign to', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('Attachment (optional)', { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Extract assignment text from PDF' })
  ).toBeVisible();
  await expect(dialog.getByLabel(/tutor context/i)).toHaveCount(0);
  await expect(
    dialog.getByRole('checkbox', { name: /submit for grade/i })
  ).toBeChecked();
  await expect(dialog.getByLabel(/point value/i)).toHaveValue('100');
  await expect(
    dialog.getByText(TUTOR_TOGGLE_HELP, { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('checkbox', { name: TUTOR_TOGGLE_LABEL, exact: true })
  ).toBeChecked();
}

async function expectCreatedAssignment(params: {
  classId: string;
  assignmentTypeId: string;
  prompt: string;
  title: string;
  pointValue: number;
  tutorEnabled?: boolean;
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
            tutorEnabled: true,
          },
        },
      },
    });
    expect(created?.assignment.title).toBe(params.title);
    expect(created?.assignment.submitForGrade).toBe(true);
    expect(created?.assignment.pointValue).toBe(params.pointValue);
    if (params.tutorEnabled !== undefined) {
      expect(created?.assignment.tutorEnabled).toBe(params.tutorEnabled);
    }
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
        schoolYear: currentSchoolYear(),
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
  test('shows Writing Practice in the teacher sidebar when enabled for the organization', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: true },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app');

      const writingPracticeLink = page.getByRole('link', {
        name: 'Writing Practice',
      });
      await expect(writingPracticeLink).toBeVisible();
      await writingPracticeLink.click();
      await page.waitForURL('**/app/writing-lessons**');
      await expect(
        page.getByRole('heading', { name: 'Writing practice' })
      ).toBeVisible();
    } finally {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: false },
      });
      await prisma.$disconnect();
    }
  });

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
    await expect(page.getByTestId('teacher-workspace-cards')).toHaveAttribute(
      'href',
      // reset=1 clears any filters the teacher left behind, so the card shows
      // everything that needs grading rather than a stale slice of it.
      '/app/documents?status=needs-grading&group=student&reset=1'
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
      await page.getByLabel('Prompt', { exact: true }).fill(prompt);
      await page.getByLabel(/point value/i).fill('25');
      const tutorToggle = page.getByRole('checkbox', {
        name: TUTOR_TOGGLE_LABEL,
        exact: true,
      });
      await tutorToggle.click();
      await expect(tutorToggle).not.toBeChecked();
      await page.getByRole('button', { name: 'Create Assignment' }).click();

      await expect(page).toHaveURL(
        (url) =>
          (url.pathname === '/app' || url.pathname === '/app/') &&
          url.search === ''
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
        tutorEnabled: false,
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
      (url) =>
        (url.pathname === '/app' || url.pathname === '/app/') &&
        url.search === ''
    );
  });

  test('creates one assignment record for each selected class from the dashboard', async ({
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
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      const prompt = `Multi-Class E2E prompt ${Date.now()}`;
      await page
        .getByTestId('teacher-assignments-grid')
        .getByRole('button', { name: /new assignment/i })
        .click();
      await expectStandardizedAssignmentForm(page);
      await page.getByLabel(CLASS_LABEL).check();
      await page.getByLabel(secondClass.title!).check();
      await page.getByLabel('Title (optional)').fill(title);
      await page.getByLabel('Prompt', { exact: true }).fill(prompt);
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
    await page.getByLabel('Prompt', { exact: true }).fill(prompt);
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
