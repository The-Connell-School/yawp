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
    await expect(header.getByTestId('class-art')).toHaveCSS(
      'background-image',
      /\/img\/class-art\//
    );
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
      const document = await prisma.document.create({
        data: {
          title: `Lifecycle needs grading ${suffix}`,
          text: 'Lifecycle spec body',
          html: '<p>Lifecycle spec body</p>',
          membership: { connect: { id: e2eContext.membershipId } },
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
      await expect(table.getByText(/^Needs Releasing/).first()).toBeVisible();
      await expect(table.getByText(/^Released/).first()).toBeVisible();

      // The retired wording must not survive.
      await expect(table.getByText('Draft', { exact: true })).toHaveCount(0);
      await expect(table.getByText('Submitted', { exact: true })).toHaveCount(
        0
      );

      // Status filter narrows rows.
      await page
        .getByTestId('class-documents-status-chips')
        .getByText(/Needs Grading/)
        .click();
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
      const baseData = {
        text: 'Redesign spec body',
        html: '<p>Redesign spec body</p>',
        membership: { connect: { id: e2eContext.membershipId } },
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

  test('documents tab can group by status', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('class-documents-group-filter').click();
    await page.getByRole('option', { name: 'Group by status' }).click();

    await expect(
      page.getByRole('button', { name: /In Progress/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Needs Grading/i }).first()
    ).toBeVisible();
  });

  test('add student flow checks email then sends an invite for new accounts', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const studentEmail = `class-invite-${Date.now()}@example.com`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /add student/i }).click();
      await page.getByTestId('add-student-email-input').fill(studentEmail);
      await page.getByTestId('add-student-next-button').click();

      await expect(page.getByTestId('add-student-confirm-message')).toContainText(
        "don't have an account in the system"
      );
      await expect(page.getByText(studentEmail)).toBeVisible();

      await page.getByTestId('add-student-confirm-button').click();

      await expect
        .poll(
          () =>
            prisma.invitation.findUnique({
              where: {
                target_type: {
                  target: studentEmail,
                  type: 'onboard-student',
                },
              },
            }),
          { timeout: 5000, message: 'Invitation not created in time' }
        )
        .not.toBeNull();

      const invitation = await prisma.invitation.findUnique({
        where: {
          target_type: { target: studentEmail, type: 'onboard-student' },
        },
      });

      expect(JSON.parse(invitation?.metadata ?? '{}')).toEqual({
        klassId: e2eContext.classId,
      });
    } finally {
      await prisma.invitation
        .deleteMany({ where: { target: studentEmail } })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });

  test('documents filters and grouping persist across reload', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    await page
      .getByTestId('class-documents-status-chips')
      .getByText(/Needs Grading/)
      .click();
    await page.getByTestId('class-documents-group-filter').click();
    await page.getByRole('option', { name: 'Group by student' }).click();

    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/status=needs-grading/);
    await expect(page.getByTestId('class-documents-group-filter')).toContainText(
      'Group by student'
    );
  });

  test('collapsed document groups persist across reload', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('class-documents-group-filter').click();
    await page.getByRole('option', { name: 'Group by status' }).click();

    const inProgressGroup = page
      .getByRole('button', { name: /In Progress/i })
      .first();
    await expect(inProgressGroup).toBeVisible();
    await inProgressGroup.click();

    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('class-documents-group-filter')).toContainText(
      'Group by status'
    );
    await expect(
      page.locator('[data-state="closed"]').filter({
        has: page.getByRole('button', { name: /^In Progress/i }),
      })
    ).toHaveCount(1);
  });

  test('sidebar navigation from class detail updates the page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await page
      .locator('nav')
      .getByRole('link', { name: 'Dashboard', exact: true })
      .click();
    await page.waitForURL(/\/app\/?$/);
    await expect(page.getByTestId('app._index')).toBeVisible();
    await expect(page.getByTestId('class-detail-header')).toHaveCount(0);

    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page
      .locator('nav')
      .getByRole('link', { name: 'Documents', exact: true })
      .click();
    await page.waitForURL(/\/app\/student-work/);
    await expect(page.getByRole('heading', { name: /student work/i })).toBeVisible();
    await expect(page.getByTestId('class-detail-header')).toHaveCount(0);
  });
});
