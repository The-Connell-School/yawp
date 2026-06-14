import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

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

async function deleteDocument(documentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.submission.deleteMany({ where: { documentId } });
    await prisma.document.delete({ where: { id: documentId } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Teacher Documents page', () => {
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
      await expect(
        table.getByText('Needs Grading').first()
      ).toBeVisible();

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
    await expect(
      page.getByRole('table', { name: /documents/i })
    ).toHaveCount(0);
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
      await expect(
        table.getByText(new RegExp(submissionTitle))
      ).toBeVisible();
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
      await expect(table.getByRole('columnheader', { name: /action/i })).toHaveCount(
        0
      );
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
});
