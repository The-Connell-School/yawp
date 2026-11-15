import { test, expect } from '../test-setup';
import {
  clickClassAssignmentRow,
  clickClassDocumentsStatusTab,
  expectClassDocumentsTable,
  expectDocumentTitleVisible,
  gotoClassDocumentsTab,
  openClassAssignmentsTab,
  openClassDocumentsTab,
  waitForClassDocumentTitle,
} from '../test-helpers';
import { currentSchoolYear } from '../../app/utils/school-year';
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
  // TODO PR #952: re-enable when class documents list is deterministic on shared CI DB.
  test.fixme(
    'documents tab uses the teacher lifecycle labels with a status filter',
    async ({ page, e2eContext, signIn }) => {
    test.setTimeout(120_000);
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
        localStorage.removeItem('yawp.student-work-view');
      });
      await waitForClassDocumentTitle(
        page,
        e2eContext.classId,
        `Lifecycle needs grading ${suffix}`,
        { assignmentId: e2eContext.assignmentId }
      );
      const table = page.getByRole('table', { name: /class documents/i });

      // Seeded + local data cover the full lifecycle.
      await expect(table.getByText('In Progress').first()).toBeVisible();
      const needsGradingRow = table.getByRole('row').filter({
        hasText: `Lifecycle needs grading ${suffix}`,
      });
      await expect(needsGradingRow).toBeVisible({ timeout: 15_000 });
      await expect(needsGradingRow.getByText('Needs Grading')).toBeVisible();
      const lifecycleTable = table;
      await expect(
        lifecycleTable.getByText(/^Needs Releasing/).first()
      ).toBeVisible();
      await expect(lifecycleTable.getByText(/^Released/).first()).toBeVisible();

      // The retired wording must not survive.
      await expect(
        lifecycleTable.getByText('Draft', { exact: true })
      ).toHaveCount(0);
      await expect(
        lifecycleTable.getByText('Submitted', { exact: true })
      ).toHaveCount(0);

      // Status filter narrows rows (chips are the source of truth; URL alone is
      // not always hydrated before the table paints in Playwright).
      await clickClassDocumentsStatusTab(page, /Needs Grading/);
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
    await expect(header.getByText(currentSchoolYear())).toBeVisible();
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
    await openClassAssignmentsTab(page);

    const header = page.getByTestId('class-detail-header');
    const assignmentsTab = header.getByRole('tab', { name: /assignments/i });
    await expect(assignmentsTab).toHaveAttribute('data-state', 'active');
    await expect(
      page.getByRole('button', { name: /new assignment/i })
    ).toBeVisible();
  });

  test('clicking an assignment row opens the assignment detail as a full page, in view mode, with the class header intact', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // This is the capability that regressed unnoticed when the row's
    // Summary button was removed and the row started opening straight into
    // edit — clicking a row must land on a read/view mode that surfaces the
    // class performance summary (and lets the teacher generate it), not the
    // edit form. It used to open in a sheet, then as a page nested inside the
    // class route; it now opens as its own page at /app/assignments/:id.
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
    await clickClassAssignmentRow(page, e2eContext.assignmentId, {
      title: 'E2E Class Assignment',
      classId: e2eContext.classId,
    });

    // Forward navigation changes the URL — linkable, not a sheet toggle.
    await page.waitForURL(
      `/app/assignments/${e2eContext.assignmentId}?classId=${e2eContext.classId}`
    );

    // No dialog/sheet — this is page content.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The page stands alone: no class shell, no assignments table behind it.
    await expect(page.getByTestId('class-detail-header')).toHaveCount(0);
    await expect(page.getByTestId('class-assignments-search')).toHaveCount(0);
    const detail = page.getByTestId('assignment-detail-page');
    await expect(detail).toBeVisible();

    await expect(
      detail.getByRole('heading', { name: 'E2E Class Assignment' })
    ).toBeVisible();
    // View mode, not edit — no prompt/title form fields.
    await expect(detail.getByLabel('Title (optional)')).toHaveCount(0);

    const generateButton = detail.getByRole('button', {
      name: /summarize class performance|regenerate/i,
    });
    await expect(generateButton).toBeVisible();
    await generateButton.click();
    await expect(detail.getByText(/how the class did/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(detail.getByText(/suggested next steps/i)).toBeVisible();
    // The cooldown now reads out of the panel subtitle rather than a separate
    // paragraph beside the button, which the panel hides while it is on cooldown.
    await expect(
      detail.getByTestId('class-insight-panel-subtitle')
    ).toContainText(/regenerate in \d+ (hours|minutes)/i);

    // Edit navigates to the dedicated builder page (#941) and returns on cancel.
    await detail.getByRole('button', { name: /^edit$/i }).click();
    await expect(page).toHaveURL(
      `/app/assignments/${e2eContext.assignmentId}/edit?classId=${e2eContext.classId}`
    );
    await expect(page.getByTestId('assignment-builder-v3')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^Edit assignment$/i })
    ).toBeVisible();
    await expect(page.locator('#abv3-title')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(
      `/app/assignments/${e2eContext.assignmentId}?classId=${e2eContext.classId}`
    );
    await expect(detail.getByLabel('Title (optional)')).toHaveCount(0);
    await expect(
      detail.getByRole('heading', { name: 'E2E Class Assignment' })
    ).toBeVisible();
    await expect(page).toHaveURL(
      `/app/assignments/${e2eContext.assignmentId}?classId=${e2eContext.classId}`
    );
  });

  test('browser back returns from the assignment detail page to the assignments table', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.waitForLoadState('networkidle');
    await clickClassAssignmentRow(page, e2eContext.assignmentId, {
      title: 'E2E Class Assignment',
      classId: e2eContext.classId,
    });
    await page.waitForURL(
      `/app/assignments/${e2eContext.assignmentId}?classId=${e2eContext.classId}`
    );
    await expect(page.getByTestId('assignment-detail-page')).toBeVisible();

    await page.goBack();

    await expect(page).toHaveURL(
      new RegExp(`/app/my-classes/${e2eContext.classId}\\?tab=assignments`)
    );
    await expect(page.getByTestId('class-assignments-search')).toBeVisible();
    await expect(page.getByTestId('assignment-detail-page')).toHaveCount(0);
    // The class header never left.
    await expect(page.getByTestId('class-detail-header')).toBeVisible();

    // ...and forward returns to the detail page again.
    await page.goForward();
    await expect(page.getByTestId('assignment-detail-page')).toBeVisible();
  });

  test('a deep link straight to an assignment lands on the standalone detail page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    // Fresh navigation directly to the detail URL — no prior click, no
    // client-side history to fall back on.
    await page.goto(
      `/app/assignments/${e2eContext.assignmentId}?classId=${e2eContext.classId}`
    );
    await page.waitForLoadState('networkidle');

    const detail = page.getByTestId('assignment-detail-page');
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole('heading', { name: 'E2E Class Assignment' })
    ).toBeVisible();
    // Standalone: the class shell is not rendered around it.
    await expect(page.getByTestId('class-detail-header')).toHaveCount(0);
    await expect(page.getByTestId('class-assignments-search')).toHaveCount(0);

    // Back to assignments returns to the class's assignments table.
    await detail.getByRole('link', { name: /back to assignments/i }).click();
    await expect(page.getByTestId('class-assignments-search')).toBeVisible();
  });

  test('the old nested assignment URL redirects to the standalone page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/assignment/${e2eContext.assignmentId}`
    );

    await page.waitForURL(
      `/app/assignments/${e2eContext.assignmentId}?classId=${e2eContext.classId}`
    );
    await expect(page.getByTestId('assignment-detail-page')).toBeVisible();
  });

  test('documents tab rows open details by document state using the shared table', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    test.setTimeout(120_000);
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

      const submittedSubmissionId = (
        await prisma.submission.findFirstOrThrow({
          where: { documentId: submittedDoc.id },
          select: { id: true },
        })
      ).id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/submissions/${submittedSubmissionId}`);
      await page.waitForURL(/\/app\/submissions\//);

      await page.goto(`/app/documents/${inProgressDoc.id}`);
      await page.waitForURL(/\/app\/documents\//);
      await expectDocumentTitleVisible(page, inProgressTitle);
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
    test.setTimeout(120_000);
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const title = `Release grades menu ${suffix}`;
    let documentId = '';
    try {
      const doc = await prisma.document.create({
        data: {
          ...classDocumentBaseData(e2eContext, title),
          submissions: {
            create: {
              title,
              text: classDocumentBaseData(e2eContext, title).text,
              html: classDocumentBaseData(e2eContext, title).html,
              submittedAt: new Date(),
              gradedAt: new Date(),
              gradedByMembershipId: e2eContext.teacherMembershipId,
              overallScore: 4,
              numericPercentage: 80,
              score: '4/5',
              releasedAt: null,
            },
          },
        },
        select: { id: true },
      });
      documentId = doc.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.class-documents-view');
      });
      // TODO(#952): Restore class-documents table + release-grades actions menu on shared CI DB.
      test.fixme(
        true,
        'Class documents table/menu unstable on release train CI (pagination, status filters); re-enable for PR #952.'
      );
      await waitForClassDocumentTitle(page, e2eContext.classId, title, {
        assignmentId: e2eContext.assignmentId,
        studentId: e2eContext.membershipId,
        status: 'all',
        timeoutMs: 90_000,
      });

      await page
        .getByRole('checkbox', { name: 'Select visible documents' })
        .check();
      const actionsButton = page.getByTestId('teacher-document-work-actions');
      await expect(actionsButton).toBeVisible();
      await expect(actionsButton).toHaveText(/Actions/);
      await expect(actionsButton.locator('.lucide-chevron-down')).toBeVisible();

      await actionsButton.click();
      const releaseGradesAction = page.getByRole('menuitem', {
        name: /Release grades\s+[1-9]/i,
      });
      await expect(releaseGradesAction).toBeVisible();
      await releaseGradesAction.click();

      await expect(
        page.getByRole('dialog', { name: /release grades to students/i })
      ).toBeVisible();
    } finally {
      if (documentId) {
        await deleteClassDocuments(prisma, [documentId]);
      }
      await prisma.$disconnect();
    }
  });

  test('documents tab can group by status', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    test.setTimeout(120_000);
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const documentIds: string[] = [];

    try {
      const inProgressTitle = `Group by status in progress ${suffix}`;
      const inProgressDoc = await createClassDocument(prisma, e2eContext, {
        title: inProgressTitle,
      });
      documentIds.push(inProgressDoc.id);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.class-documents-view');
      });

      await gotoClassDocumentsTab(page, e2eContext.classId, {
        documentGroup: 'status',
        status: 'all',
      });
      await openClassDocumentsTab(page);
      await expect(page.getByTestId('class-documents-group-filter')).toContainText(
        'Group by status'
      );

      await expect
        .poll(
          async () => {
            const inProgressGroup = page
              .getByRole('button', { name: /In Progress/i })
              .first();
            if (!(await inProgressGroup.isVisible().catch(() => false))) {
              await gotoClassDocumentsTab(page, e2eContext.classId, {
                documentGroup: 'status',
                status: 'all',
              });
              await openClassDocumentsTab(page);
              return false;
            }
            if ((await inProgressGroup.getAttribute('aria-expanded')) !== 'true') {
              await inProgressGroup.click();
            }
            return page
              .getByText(inProgressTitle, { exact: true })
              .isVisible()
              .catch(() => false);
          },
          { timeout: 90_000 }
        )
        .toBe(true);
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

  test('add student flow joins an existing student to an additional class', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const studentEmail = `class-join-${suffix}@example.com`;
    let otherClassId: string | undefined;

    try {
      const otherClass = await prisma.class.create({
        data: {
          code: `JOIN${suffix}`.toUpperCase().slice(0, 12),
          schoolYear: '2026-2027',
          grade: '9',
          period: '7',
          school: { connect: { id: e2eContext.schoolId } },
          teachers: { connect: { id: e2eContext.teacherMembershipId } },
        },
        select: { id: true },
      });
      otherClassId = otherClass.id;

      await prisma.orgMembership.create({
        data: {
          user: { create: { email: studentEmail, name: 'Existing Joiner' } },
          organization: { connect: { id: e2eContext.organizationId } },
          role: 'STUDENT',
          classesAsStudent: { connect: { id: otherClass.id } },
        },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /add student/i }).click();
      await page.getByTestId('add-student-email-input').fill(studentEmail);
      await page.getByTestId('add-student-next-button').click();

      await expect(
        page.getByTestId('add-student-confirm-message')
      ).toContainText('have an account in the system');

      await page.getByTestId('add-student-confirm-button').click();

      await expect
        .poll(
          async () => {
            const membership = await prisma.orgMembership.findFirst({
              where: { user: { email: studentEmail } },
              select: { classesAsStudent: { select: { id: true } } },
            });
            return (membership?.classesAsStudent ?? [])
              .map((klass) => klass.id)
              .sort();
          },
          { timeout: 5000, message: 'Student not added to the second class' }
        )
        .toEqual([otherClass.id, e2eContext.classId].sort());

      // Adding the same student again is a no-op with a clear message.
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /add student/i }).click();
      await page.getByTestId('add-student-email-input').fill(studentEmail);
      await page.getByTestId('add-student-next-button').click();

      await expect(
        page.getByTestId('add-student-confirm-message')
      ).toContainText('already in this class');
      await expect(page.getByTestId('add-student-confirm-button')).toHaveCount(
        0
      );

      const membershipsAfter = await prisma.orgMembership.findMany({
        where: { user: { email: studentEmail } },
        select: { classesAsStudent: { select: { id: true } } },
      });
      expect(membershipsAfter).toHaveLength(1);
      expect(membershipsAfter[0]?.classesAsStudent).toHaveLength(2);
    } finally {
      await prisma.orgMembership
        .deleteMany({ where: { user: { email: studentEmail } } })
        .catch(() => {});
      await prisma.user
        .deleteMany({ where: { email: studentEmail } })
        .catch(() => {});
      if (otherClassId) {
        await prisma.class
          .delete({ where: { id: otherClassId } })
          .catch(() => {});
      }
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
