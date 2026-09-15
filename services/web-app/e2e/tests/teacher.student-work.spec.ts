import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import bcrypt from 'bcryptjs';

function createPassword(password: string) {
  return { hash: bcrypt.hashSync(password, 10) };
}

async function createSubmittedDocument(params: {
  membershipId: string;
  assignmentTypeId: string;
  documentTitle: string;
  submissionTitle: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.document.create({
      data: {
        title: params.documentTitle,
        text: 'Student work spec body',
        html: '<p>Student work spec body</p>',
        membership: { connect: { id: params.membershipId } },
        assignmentType: { connect: { id: params.assignmentTypeId } },
        submissions: {
          create: {
            title: params.submissionTitle,
            text: 'Student work spec body',
            html: '<p>Student work spec body</p>',
            submittedAt: new Date(),
          },
        },
      },
      select: { id: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function createAssignmentlessLifecycleDocuments(params: {
  membershipId: string;
  assignmentTypeId: string;
  suffix: string;
}) {
  const prisma = createE2EPrismaClient();
  const createdDocumentIds: string[] = [];

  try {
    const inProgress = await prisma.document.create({
      data: {
        title: `Assignmentless in progress ${params.suffix}`,
        text: 'Assignmentless in-progress body',
        html: '<p>Assignmentless in-progress body</p>',
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
      },
      select: { id: true },
    });
    createdDocumentIds.push(inProgress.id);

    const needsGrading = await prisma.document.create({
      data: {
        title: `Assignmentless needs grading ${params.suffix}`,
        text: 'Assignmentless needs grading body',
        html: '<p>Assignmentless needs grading body</p>',
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
        submissions: {
          create: {
            title: `Assignmentless needs grading ${params.suffix}`,
            text: 'Assignmentless needs grading body',
            html: '<p>Assignmentless needs grading body</p>',
            submittedAt: new Date(),
          },
        },
      },
      select: { id: true },
    });
    createdDocumentIds.push(needsGrading.id);

    const needsReleasing = await prisma.document.create({
      data: {
        title: `Assignmentless needs releasing ${params.suffix}`,
        text: 'Assignmentless needs releasing body',
        html: '<p>Assignmentless needs releasing body</p>',
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
        submissions: {
          create: {
            title: `Assignmentless needs releasing ${params.suffix}`,
            text: 'Assignmentless needs releasing body',
            html: '<p>Assignmentless needs releasing body</p>',
            submittedAt: new Date(),
            gradedAt: new Date(),
            numericPercentage: 82,
            letterGrade: 'B',
          },
        },
      },
      select: { id: true },
    });
    createdDocumentIds.push(needsReleasing.id);

    return createdDocumentIds;
  } catch (error) {
    await prisma.submission
      .deleteMany({ where: { documentId: { in: createdDocumentIds } } })
      .catch(() => {});
    await prisma.document
      .deleteMany({ where: { id: { in: createdDocumentIds } } })
      .catch(() => {});
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function createArchivedDraftParityDocuments(params: {
  membershipId: string;
  assignmentTypeId: string;
  suffix: string;
}) {
  const prisma = createE2EPrismaClient();
  const createdDocumentIds: string[] = [];

  try {
    const activeDraft = await prisma.document.create({
      data: {
        title: `Visible active draft ${params.suffix}`,
        text: 'Visible active draft body',
        html: '<p>Visible active draft body</p>',
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
      },
      select: { id: true },
    });
    createdDocumentIds.push(activeDraft.id);

    const archivedDraft = await prisma.document.create({
      data: {
        title: `Hidden archived empty draft ${params.suffix}`,
        text: 'Hidden archived empty draft body',
        html: '<p>Hidden archived empty draft body</p>',
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
        archivedAt: new Date(),
      },
      select: { id: true },
    });
    createdDocumentIds.push(archivedDraft.id);

    const archivedSubmitted = await prisma.document.create({
      data: {
        title: `Visible archived submitted ${params.suffix}`,
        text: 'Visible archived submitted body',
        html: '<p>Visible archived submitted body</p>',
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
        archivedAt: new Date(),
        submissions: {
          create: {
            title: `Visible archived submitted ${params.suffix}`,
            text: 'Visible archived submitted body',
            html: '<p>Visible archived submitted body</p>',
            submittedAt: new Date(),
          },
        },
      },
      select: { id: true },
    });
    createdDocumentIds.push(archivedSubmitted.id);

    return createdDocumentIds;
  } catch (error) {
    await prisma.submission
      .deleteMany({ where: { documentId: { in: createdDocumentIds } } })
      .catch(() => {});
    await prisma.document
      .deleteMany({ where: { id: { in: createdDocumentIds } } })
      .catch(() => {});
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function createTeacherWithOnlyInProgressDocument(params: {
  organizationId: string;
  schoolId: string;
  assignmentTypeId: string;
  suffix: string;
}) {
  const prisma = createE2EPrismaClient();
  const password = 'teacher-empty-release-password';
  const teacherEmail = `release-empty-teacher.${params.suffix}@yawp.test`;
  const studentEmail = `release-empty-student.${params.suffix}@yawp.test`;

  try {
    const teacher = await prisma.user.create({
      data: {
        email: teacherEmail,
        name: 'Release Empty Teacher',
        password: { create: createPassword(password) },
        memberships: {
          create: {
            organizationId: params.organizationId,
            role: 'TEACHER',
          },
        },
      },
      include: { memberships: true },
    });
    const teacherMembership = teacher.memberships[0]!;

    await prisma.$executeRaw`
      INSERT INTO "_SchoolTeachers" ("A", "B")
      VALUES (${teacherMembership.id}, ${params.schoolId})
      ON CONFLICT DO NOTHING
    `;

    const klass = await prisma.class.create({
      data: {
        code: `REL-${params.suffix}`.slice(0, 32),
        schoolYear: '2025-2026',
        period: '1',
        grade: '11',
        schoolId: params.schoolId,
        teachers: { connect: { id: teacherMembership.id } },
      },
      select: { id: true },
    });

    const student = await prisma.user.create({
      data: {
        email: studentEmail,
        name: 'Release Empty Student',
        password: { create: createPassword('student-empty-release-password') },
        memberships: {
          create: {
            organizationId: params.organizationId,
            role: 'STUDENT',
            classesAsStudent: { connect: { id: klass.id } },
          },
        },
      },
      include: { memberships: true },
    });
    const studentMembership = student.memberships[0]!;

    const document = await prisma.document.create({
      data: {
        title: `Only in progress ${params.suffix}`,
        text: 'Only in progress body',
        html: '<p>Only in progress body</p>',
        membershipId: studentMembership.id,
        assignmentTypeId: params.assignmentTypeId,
      },
      select: { id: true },
    });

    return {
      teacherEmail,
      password,
      documentId: document.id,
      classId: klass.id,
      teacherMembershipId: teacherMembership.id,
      studentMembershipId: studentMembership.id,
      teacherUserId: teacher.id,
      studentUserId: student.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteDocument(documentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.submission.deleteMany({ where: { documentId } });
    await prisma.document.delete({ where: { id: documentId } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteDocuments(documentIds: string[]) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.submission
      .deleteMany({ where: { documentId: { in: documentIds } } })
      .catch(() => {});
    await prisma.document
      .deleteMany({ where: { id: { in: documentIds } } })
      .catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteIsolatedTeacherFixture(fixture: {
  documentId: string;
  classId: string;
  teacherMembershipId: string;
  studentMembershipId: string;
  teacherUserId: string;
  studentUserId: string;
}) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.document
      .deleteMany({ where: { id: fixture.documentId } })
      .catch(() => {});
    await prisma.class
      .deleteMany({ where: { id: fixture.classId } })
      .catch(() => {});
    await prisma.orgMembership
      .deleteMany({
        where: {
          id: {
            in: [fixture.teacherMembershipId, fixture.studentMembershipId],
          },
        },
      })
      .catch(() => {});
    await prisma.user
      .deleteMany({
        where: { id: { in: [fixture.teacherUserId, fixture.studentUserId] } },
      })
      .catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Teacher Documents page', () => {
  test('shows assignmentless enrolled class documents across lifecycle statuses', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const suffix = Date.now().toString(36);
    const documentIds = await createAssignmentlessLifecycleDocuments({
      membershipId: e2eContext.membershipId,
      assignmentTypeId: e2eContext.assignmentTypeId,
      suffix,
    });

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.student-work-view');
      });
      await page.goto(`/app/documents?q=${suffix}`);
      await page.waitForLoadState('networkidle');

      const chips = page.getByTestId('student-work-status-chips');
      await expect(chips.getByRole('tab', { name: /^All\s+3/ })).toBeVisible();
      await expect(
        chips.getByRole('tab', { name: /In Progress\s+1/ })
      ).toBeVisible();
      await expect(
        chips.getByRole('tab', { name: /Needs Grading\s+1/ })
      ).toBeVisible();
      await expect(
        chips.getByRole('tab', { name: /Needs Releasing\s+1/ })
      ).toBeVisible();

      const table = page.getByRole('table', { name: /documents/i });
      await expect(
        table.getByText(`Assignmentless in progress ${suffix}`)
      ).toBeVisible();
      await expect(
        table.getByText(`Assignmentless needs grading ${suffix}`)
      ).toBeVisible();
      await expect(
        table.getByText(`Assignmentless needs releasing ${suffix}`)
      ).toBeVisible();
    } finally {
      await deleteDocuments(documentIds);
    }
  });

  test('hides archived empty drafts while keeping archived submitted work', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const suffix = Date.now().toString(36);
    const documentIds = await createArchivedDraftParityDocuments({
      membershipId: e2eContext.membershipId,
      assignmentTypeId: e2eContext.assignmentTypeId,
      suffix,
    });

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.student-work-view');
      });
      await page.goto(`/app/documents?q=${suffix}`);
      await page.waitForLoadState('networkidle');

      const chips = page.getByTestId('student-work-status-chips');
      await expect(chips.getByRole('tab', { name: /^All\s+2/ })).toBeVisible();
      await expect(
        chips.getByRole('tab', { name: /In Progress\s+1/ })
      ).toBeVisible();
      await expect(
        chips.getByRole('tab', { name: /Needs Grading\s+1/ })
      ).toBeVisible();

      const table = page.getByRole('table', { name: /documents/i });
      await expect(
        table.getByText(`Visible active draft ${suffix}`)
      ).toBeVisible();
      await expect(
        table.getByText(`Visible archived submitted ${suffix}`)
      ).toBeVisible();
      await expect(
        table.getByText(`Hidden archived empty draft ${suffix}`)
      ).toHaveCount(0);
    } finally {
      await deleteDocuments(documentIds);
    }
  });

  test('shows lifecycle chips and filters by status', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const suffix = Date.now().toString(36);
    const submissionTitle = `Student work submission ${suffix}`;
    const document = await createSubmittedDocument({
      membershipId: e2eContext.membershipId,
      assignmentTypeId: e2eContext.assignmentTypeId,
      documentTitle: `Student work doc ${suffix}`,
      submissionTitle,
    });

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/documents');
      await page.waitForLoadState('networkidle');

      const chips = page.getByTestId('student-work-status-chips');
      await expect(chips).toBeVisible();
      await expect(chips.getByText(/Needs Grading/)).toBeVisible();
      await expect(chips.getByText(/Released/)).toBeVisible();

      const table = page.getByRole('table', { name: /documents/i });
      await expect(table.getByText('Needs Grading').first()).toBeVisible();

      // Status chip narrows the rows.
      await chips.getByText(/Needs Grading/).click();
      await page.waitForURL(/status=needs-grading/);
      await expect(table.getByText(/^Released/)).toHaveCount(0);
      await expect(
        page.getByRole('row', { name: new RegExp(submissionTitle) })
      ).toBeVisible();
    } finally {
      await deleteDocument(document.id);
    }
  });

  test('groups student work by class with collapsible sections', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/documents?group=class');
    await page.waitForLoadState('networkidle');

    const group = page
      .getByRole('button', { name: /Grade 9th .* Period 1st/ })
      .first();
    await expect(group).toBeVisible();

    // Collapsing hides the group's rows.
    await group.click();
    await expect(page.getByRole('table', { name: /documents/i })).toHaveCount(
      0
    );
  });

  test('search narrows results by document title', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const suffix = Date.now().toString(36);
    const submissionTitle = `Searchable submission ${suffix}`;
    const document = await createSubmittedDocument({
      membershipId: e2eContext.membershipId,
      assignmentTypeId: e2eContext.assignmentTypeId,
      documentTitle: `Searchable doc ${suffix}`,
      submissionTitle,
    });

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/documents?q=Searchable+doc+${suffix}`);
      await page.waitForLoadState('networkidle');

      const table = page.getByRole('table', { name: /documents/i });
      await expect(table.locator('tbody tr')).toHaveCount(1);
      await expect(table.getByText(new RegExp(submissionTitle))).toBeVisible();
    } finally {
      await deleteDocument(document.id);
    }
  });

  test('opens submitted work in the grading context and preserves return navigation', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const suffix = Date.now().toString(36);
    const submissionTitle = `Returnable submission ${suffix}`;
    const document = await createSubmittedDocument({
      membershipId: e2eContext.membershipId,
      assignmentTypeId: e2eContext.assignmentTypeId,
      documentTitle: `Returnable doc ${suffix}`,
      submissionTitle,
    });

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/documents?status=needs-grading');
      await page.waitForLoadState('networkidle');

      const table = page.getByRole('table', { name: /documents/i });
      const row = page.getByRole('row', { name: new RegExp(submissionTitle) });
      await expect(
        table.getByRole('columnheader', { name: /action/i })
      ).toHaveCount(0);
      await expect(row.getByRole('link', { name: /view/i })).toHaveCount(0);

      await row.click();
      await page.waitForURL(/\/app\/submissions\//);
      expect(page.url()).toContain('edit=1');
      expect(page.url()).toContain(
        encodeURIComponent('/app/documents?status=needs-grading')
      );
    } finally {
      await deleteDocument(document.id);
    }
  });

  test('shows the shared release grades action menu', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/documents?status=graded');
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('checkbox', { name: 'Select visible documents' })
      .check();
    const actionsButton = page.getByTestId('teacher-document-work-actions');
    await expect(actionsButton).toBeVisible();
    await expect(actionsButton).toHaveText(/Actions/);
    await expect(actionsButton.locator('.lucide-chevron-down')).toBeVisible();
    const selectionSummary = page.getByTestId(
      'teacher-document-work-selection-summary'
    );
    await expect(selectionSummary).toHaveText(/1 selected/);

    const statusBox = await page
      .getByTestId('student-work-status-chips')
      .boundingBox();
    const selectionBox = await selectionSummary.boundingBox();
    expect(statusBox).not.toBeNull();
    expect(selectionBox).not.toBeNull();
    expect(statusBox!.y + statusBox!.height).toBeLessThanOrEqual(
      selectionBox!.y
    );

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

  test('keeps the actions menu visible with a disabled release item when no grades can release', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const suffix = Date.now().toString(36);
    const fixture = await createTeacherWithOnlyInProgressDocument({
      organizationId: e2eContext.organizationId,
      schoolId: e2eContext.schoolId,
      assignmentTypeId: e2eContext.assignmentTypeId,
      suffix,
    });

    try {
      await signIn(fixture.teacherEmail, fixture.password);
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.student-work-view');
      });
      await page.goto('/app/documents');
      await page.waitForLoadState('networkidle');

      const actionsButton = page.getByTestId('teacher-document-work-actions');
      const filterButton = page.getByRole('button', { name: /^Filter/ });
      const groupSelect = page.getByTestId('student-work-group-select');

      await expect(actionsButton).toBeVisible();
      await expect(filterButton).toBeVisible();
      await expect(groupSelect).toBeVisible();

      const actionsBox = await actionsButton.boundingBox();
      const filterBox = await filterButton.boundingBox();
      const groupBox = await groupSelect.boundingBox();
      expect(actionsBox).not.toBeNull();
      expect(filterBox).not.toBeNull();
      expect(groupBox).not.toBeNull();
      expect(actionsBox!.x).toBeLessThan(filterBox!.x);
      expect(filterBox!.x).toBeLessThan(groupBox!.x);

      await actionsButton.click();
      const releaseGradesAction = page.getByRole('menuitem', {
        name: /Release grades/i,
      });
      await expect(releaseGradesAction).toBeVisible();
      await expect(releaseGradesAction).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      await expect(
        page.getByRole('dialog', { name: /release grades to students/i })
      ).toHaveCount(0);
    } finally {
      await deleteIsolatedTeacherFixture(fixture);
    }
  });
});
