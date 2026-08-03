import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';

type E2EPrisma = ReturnType<typeof createE2EPrismaClient>;

function classDocumentBaseData(e2eContext: E2EContext, title: string) {
  return {
    title,
    text: 'E2E class document body',
    html: '<p>E2E class document body</p>',
    membership: { connect: { id: e2eContext.membershipId } },
    assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
    assignment: { connect: { id: e2eContext.assignmentId } },
    classAssignment: { connect: { id: e2eContext.classAssignmentId } },
  };
}

async function createClassDocument(
  prisma: E2EPrisma,
  e2eContext: E2EContext,
  params: { title: string; submitted?: boolean }
) {
  const baseData = classDocumentBaseData(e2eContext, params.title);
  if (params.submitted) {
    return prisma.document.create({
      data: {
        ...baseData,
        submissions: {
          create: {
            title: params.title,
            text: baseData.text,
            html: baseData.html,
            submittedAt: new Date(),
          },
        },
      },
      select: { id: true },
    });
  }

  return prisma.document.create({
    data: baseData,
    select: { id: true },
  });
}

async function deleteClassDocuments(prisma: E2EPrisma, documentIds: string[]) {
  if (documentIds.length === 0) return;
  await prisma.submission
    .deleteMany({ where: { documentId: { in: documentIds } } })
    .catch(() => {});
  await prisma.document
    .deleteMany({ where: { id: { in: documentIds } } })
    .catch(() => {});
}

test.describe('Teacher class documents lifecycle', () => {
  test('documents tab uses the teacher lifecycle labels with a status filter', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const documentIds: string[] = [];

    try {
      // Earlier suites submit the seeded in-progress document, so create our own
      // lifecycle rows instead of relying on seed state.
      const inProgressDoc = await createClassDocument(prisma, e2eContext, {
        title: `Lifecycle in progress ${suffix}`,
      });
      documentIds.push(inProgressDoc.id);
      const needsGradingDoc = await createClassDocument(prisma, e2eContext, {
        title: `Lifecycle needs grading ${suffix}`,
        submitted: true,
      });
      documentIds.push(needsGradingDoc.id);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.class-documents-view');
      });
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
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&status=needs-grading`
      );
      await page.waitForLoadState('networkidle');
      await expect(
        page
          .getByTestId('class-documents-status-chips')
          .getByRole('tab', { name: /Needs Grading/ })
      ).toHaveAttribute('aria-selected', 'true');
      const filteredTable = page.getByRole('table', {
        name: /class documents/i,
      });
      await expect(
        filteredTable.locator('tbody').getByText('Needs Grading').first()
      ).toBeVisible();
      await expect
        .poll(async () => {
          return filteredTable
            .locator('tbody')
            .getByText(/^Released/)
            .count();
        })
        .toBe(0);
    } finally {
      await deleteClassDocuments(prisma, documentIds);
      await prisma.$disconnect();
    }
  });
});

test.describe.serial('Teacher class page redesign', () => {
  test('header tabs default to Students and replace the old tab bar', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    const header = page.getByTestId('class-detail-header');
    await expect(header.getByRole('tab', { name: /students/i })).toHaveCount(1);
    await expect(header.getByRole('tab', { name: /documents/i })).toHaveCount(
      1
    );
    // The class now carries its own full-featured Assignments tab.
    await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(
      1
    );

    const studentsTab = header.getByRole('tab', { name: /students/i });
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
    const headerBox = await header.boundingBox();
    const tablist = header.getByRole('tablist', { name: 'Class sections' });
    const tablistBox = await tablist.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(tablistBox).not.toBeNull();
    expect(tablistBox!.x - headerBox!.x).toBeGreaterThanOrEqual(0);
    expect(tablistBox!.x - headerBox!.x).toBeLessThan(16);
    expect(tablistBox!.width).toBeGreaterThanOrEqual(360);
    expect(tablistBox!.width).toBeLessThanOrEqual(520);
    expect(tablistBox!.width).toBeLessThan(headerBox!.width * 0.7);
    const studentsTabBox = await header
      .getByRole('tab', { name: /students/i })
      .boundingBox();
    const documentsTabBox = await header
      .getByRole('tab', { name: /documents/i })
      .boundingBox();
    expect(studentsTabBox).not.toBeNull();
    expect(documentsTabBox).not.toBeNull();
    expect(studentsTabBox!.width).toBeGreaterThan(160);
    expect(documentsTabBox!.width).toBeGreaterThan(160);
    expect(
      Math.abs(studentsTabBox!.width - documentsTabBox!.width)
    ).toBeLessThan(4);
    // The class now carries its own full-featured Assignments tab, which
    // sits last in the tab bar — it owns the closing right border, not
    // Documents.
    const assignmentsTab = header.getByRole('tab', { name: /assignments/i });
    await expect(assignmentsTab).toHaveCSS('border-right-width', '1px');
    const documentsTab = header.getByRole('tab', { name: /documents/i });
    await documentsTab.click();
    await expect(documentsTab).toHaveAttribute('data-state', 'active');
    const activeIndicator = tablist.locator('[aria-hidden="true"]').first();
    await expect(activeIndicator).toHaveCSS(
      'border-bottom-right-radius',
      '0px'
    );
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

  test('tab=assignments shows the class-scoped Assignments tab in place', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // The standalone /app/assignments page was retired — assignments now
    // live entirely inside the class detail header's Assignments tab.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.waitForLoadState('networkidle');

    const header = page.getByTestId('class-detail-header');
    const assignmentsTab = header.getByRole('tab', { name: /assignments/i });
    await expect(assignmentsTab).toHaveAttribute('data-state', 'active');
    await expect(
      page.getByRole('button', { name: /new assignment/i })
    ).toBeVisible();
  });

  test('clicking an assignment row opens the class performance summary in view mode', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // This is the capability that regressed unnoticed when the row's
    // Summary button was removed and the row started opening straight into
    // edit — clicking a row must land on a read/view mode that surfaces the
    // class performance summary (and lets the teacher generate it), not the
    // edit form.
    const prisma = createE2EPrismaClient();
    try {
      await prisma.classAssignmentInsight.deleteMany({
        where: { classAssignmentId: e2eContext.classAssignmentId },
      });
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.waitForLoadState('networkidle');

    await page.getByText('E2E Class Assignment', { exact: true }).click();

    const sheet = page.getByRole('dialog');
    await expect(
      sheet.getByRole('heading', { name: /class performance summary/i })
    ).toBeVisible();
    // View mode, not edit — no prompt/title form fields.
    await expect(sheet.getByLabel('Title (optional)')).toHaveCount(0);

    const generateButton = sheet.getByRole('button', {
      name: /summarize class performance|regenerate/i,
    });
    await expect(generateButton).toBeVisible();
    await generateButton.click();
    await expect(sheet.getByText(/how the class did/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(sheet.getByText(/suggested next steps/i)).toBeVisible();
    await expect(
      sheet.getByTestId('class-insight-generate-unavailable-reason')
    ).toContainText(/regenerate in \d+ (hours|minutes)/i);

    // Edit is reachable explicitly, and switches the same sheet to the form.
    await sheet.getByRole('button', { name: /^edit$/i }).click();
    await expect(sheet.getByLabel('Title (optional)')).toBeVisible();
  });

  test('documents tab rows open details by document state using the shared table', async ({
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
      const submittedDoc = await createClassDocument(prisma, e2eContext, {
        title: submittedTitle,
        submitted: true,
      });
      documentIds.push(submittedDoc.id);
      const inProgressDoc = await createClassDocument(prisma, e2eContext, {
        title: inProgressTitle,
      });
      documentIds.push(inProgressDoc.id);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
      await page.waitForLoadState('networkidle');

      const submittedRow = page
        .getByRole('row', {
          name: new RegExp(submittedTitle),
        })
        .first();
      await expect(
        submittedRow.getByRole('link', { name: /^View$/i })
      ).toHaveCount(0);
      await expect(
        page
          .getByRole('table', { name: /class documents/i })
          .getByRole('columnheader', { name: /action/i })
      ).toHaveCount(0);
      await submittedRow.click();
      await page.waitForURL(/\/app\/submissions\//);

      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
      await page.waitForLoadState('networkidle');
      const inProgressRow = page
        .getByRole('row', {
          name: new RegExp(inProgressTitle),
        })
        .first();
      await expect(
        inProgressRow.getByRole('link', { name: /^View$/i })
      ).toHaveCount(0);
      await expect(inProgressRow).toHaveAttribute('tabindex', '0');
    } finally {
      await deleteClassDocuments(prisma, documentIds);
      await prisma.$disconnect();
    }
  });

  test('release grades flow is reachable from the documents tab actions menu', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    const actionsButton = page.getByTestId('teacher-document-work-actions');
    await expect(actionsButton).toBeVisible();
    await expect(actionsButton).toHaveText(/Actions/);
    await expect(actionsButton.locator('.lucide-chevron-down')).toBeVisible();

    await actionsButton.click();
    const releaseGradesAction = page.getByRole('menuitem', {
      name: /Release grades\s+1/i,
    });
    await expect(releaseGradesAction).toBeVisible();
    await releaseGradesAction.click();

    await expect(
      page.getByRole('dialog', { name: /release grades to students/i })
    ).toBeVisible();
  });

  test('documents tab can group by status', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const documentIds: string[] = [];

    try {
      const inProgressDoc = await createClassDocument(prisma, e2eContext, {
        title: `Group by status in progress ${suffix}`,
      });
      documentIds.push(inProgressDoc.id);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.class-documents-view');
      });
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&documentGroup=status`
      );
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /Needs Grading/i }).first()
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /In Progress/i }).first()
      ).toBeVisible();
    } finally {
      await deleteClassDocuments(prisma, documentIds);
      await prisma.$disconnect();
    }
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

      await expect(
        page.getByTestId('add-student-confirm-message')
      ).toContainText("don't have an account in the system");
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
    await page.addInitScript(() => {
      localStorage.removeItem('yawp.class-documents-view');
    });
    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=documents&status=needs-grading&documentGroup=student`
    );
    await page.waitForLoadState('networkidle');

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/status=needs-grading/);
    await expect(page).toHaveURL(/documentGroup=student/);
    await expect(
      page.getByTestId('class-documents-group-filter')
    ).toContainText('Group by student');
  });

  test('collapsed document groups persist across reload', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const documentIds: string[] = [];

    try {
      const inProgressDoc = await createClassDocument(prisma, e2eContext, {
        title: `Collapsed group in progress ${suffix}`,
      });
      documentIds.push(inProgressDoc.id);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.class-documents-view');
      });
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&documentGroup=status`
      );
      await page.waitForLoadState('networkidle');

      const inProgressGroup = page
        .getByRole('button', { name: /In Progress/i })
        .first();
      await expect(inProgressGroup).toBeVisible();
      await inProgressGroup.click();

      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByTestId('class-documents-group-filter')
      ).toContainText('Group by status');
      await expect(inProgressGroup).toBeVisible();
    } finally {
      await deleteClassDocuments(prisma, documentIds);
      await prisma.$disconnect();
    }
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
    await page.waitForURL(/\/app\/documents/);
    await expect(
      page.getByRole('heading', { name: /documents/i })
    ).toBeVisible();
    await expect(page.getByTestId('class-detail-header')).toHaveCount(0);
  });
});
