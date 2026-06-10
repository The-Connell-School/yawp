import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Teacher class page redesign', () => {
  test('shows only Students and Documents tabs, defaulting to Students', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: /students/i })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /documents/i })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(
      0
    );

    const studentsTab = page.getByRole('tab', { name: /students/i });
    await expect(studentsTab).toHaveAttribute('data-state', 'active');
  });

  test('compact header shows class identity, counts, and actions', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    const header = page.getByTestId('class-detail-header');
    await expect(header).toBeVisible();
    await expect(header.getByText(/Grade 9th .* Period 1st/)).toBeVisible();
    await expect(header.getByText('E2E High')).toBeVisible();
    await expect(header.getByText('2024-2025')).toBeVisible();
    await expect(header.getByText(e2eContext.classCode)).toBeVisible();
    await expect(
      header.getByRole('button', { name: /edit class/i })
    ).toBeVisible();
    await expect(header.getByTestId('class-art')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /back to my classes/i })
    ).toBeVisible();

    const gradientCount = await page
      .locator('[class*="bg-gradient-to-br"]')
      .count();
    expect(gradientCount).toBe(0);
  });

  test('tab=assignments redirects to the teacher Assignments page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.waitForURL('**/app/assignments');
    await expect(
      page.getByRole('heading', { name: 'Assignments' })
    ).toBeVisible();
  });

  test('documents tab uses the teacher lifecycle labels with a status filter', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    let documentId = '';

    try {
      // Earlier suites may grade the seeded submitted document, so provide a
      // guaranteed needs-grading row of our own.
      const studentProfile = await prisma.studentProfile.findFirstOrThrow({
        where: { profileId: e2eContext.profileId },
        select: { id: true },
      });
      const document = await prisma.document.create({
        data: {
          title: `Lifecycle needs grading ${suffix}`,
          text: 'Lifecycle spec body',
          html: '<p>Lifecycle spec body</p>',
          profile: { connect: { id: e2eContext.profileId } },
          studentProfile: { connect: { id: studentProfile.id } },
          assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
          submissions: {
            create: {
              title: `Lifecycle needs grading ${suffix}`,
              text: 'Lifecycle spec body',
              html: '<p>Lifecycle spec body</p>',
              submittedAt: new Date(),
            },
          },
        },
        select: { id: true },
      });
      documentId = document.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
      await page.waitForLoadState('networkidle');

      const table = page.getByRole('table', { name: /class documents/i });
      await expect(table).toBeVisible();

      // Seeded + local data cover the full lifecycle.
      await expect(table.getByText('In Progress').first()).toBeVisible();
      await expect(table.getByText('Needs Grading').first()).toBeVisible();
      await expect(table.getByText(/^Graded/).first()).toBeVisible();
      await expect(table.getByText(/^Released/).first()).toBeVisible();

      // The retired wording must not survive.
      await expect(table.getByText('Draft', { exact: true })).toHaveCount(0);
      await expect(table.getByText('Submitted', { exact: true })).toHaveCount(
        0
      );

      // Status filter narrows rows.
      await page.getByTestId('class-documents-status-filter').click();
      await page.getByRole('option', { name: 'Needs Grading' }).click();
      await expect(table.getByText('Needs Grading').first()).toBeVisible();
      await expect(table.getByText(/^Released/)).toHaveCount(0);
    } finally {
      if (documentId) {
        await prisma.submission
          .deleteMany({ where: { documentId } })
          .catch(() => {});
        await prisma.document
          .delete({ where: { id: documentId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  test('view details routes by document state', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const submittedTitle = `Redesign submitted ${suffix}`;
    const inProgressTitle = `Redesign in progress ${suffix}`;
    const documentIds: string[] = [];

    try {
      const studentProfile = await prisma.studentProfile.findFirstOrThrow({
        where: { profileId: e2eContext.profileId },
        select: { id: true },
      });
      const baseData = {
        text: 'Redesign spec body',
        html: '<p>Redesign spec body</p>',
        profile: { connect: { id: e2eContext.profileId } },
        studentProfile: { connect: { id: studentProfile.id } },
        assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
      };
      const submittedDoc = await prisma.document.create({
        data: {
          ...baseData,
          title: submittedTitle,
          submissions: {
            create: {
              title: submittedTitle,
              text: 'Redesign spec body',
              html: '<p>Redesign spec body</p>',
              submittedAt: new Date(),
            },
          },
        },
        select: { id: true },
      });
      documentIds.push(submittedDoc.id);
      const inProgressDoc = await prisma.document.create({
        data: { ...baseData, title: inProgressTitle },
        select: { id: true },
      });
      documentIds.push(inProgressDoc.id);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
      await page.waitForLoadState('networkidle');

      const submittedRow = page.getByRole('row', {
        name: new RegExp(submittedTitle),
      });
      const submittedHref = await submittedRow
        .getByRole('link', { name: /view details/i })
        .getAttribute('href');
      expect(submittedHref).toMatch(/\/app\/submissions\//);

      const inProgressRow = page.getByRole('row', {
        name: new RegExp(inProgressTitle),
      });
      const inProgressHref = await inProgressRow
        .getByRole('link', { name: /view details/i })
        .getAttribute('href');
      expect(inProgressHref).toMatch(/\/app\/documents\//);
    } finally {
      await prisma.submission
        .deleteMany({ where: { documentId: { in: documentIds } } })
        .catch(() => {});
      await prisma.document
        .deleteMany({ where: { id: { in: documentIds } } })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });

  test('release grades flow is reachable from the documents tab', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('class-release-grades-open')).toBeVisible();
  });
});
