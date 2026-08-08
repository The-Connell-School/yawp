import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';

const FIXTURE_SUMMARY = {
  overview:
    'The class showed strong thesis statements but many students struggled with evidence integration.',
  categories: [
    {
      key: 'thesis',
      label: 'Thesis',
      status: 'strength',
      summary: 'Most students wrote clear, arguable theses.',
    },
    {
      key: 'evidence',
      label: 'Evidence',
      status: 'gap',
      summary: 'Several students need support citing textual evidence.',
    },
  ],
  nextSteps: [
    {
      title: 'Model evidence integration',
      detail: 'Show a mentor paragraph that blends quote and analysis.',
      rubricCategory: 'evidence',
    },
  ],
  differentiation: {
    focusGroups: [
      {
        category: 'evidence',
        label: 'Evidence',
        students: [{ name: 'E2E Test Student', href: null }],
      },
    ],
    individuals: [],
  },
};

async function seedReadyInsight(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId: e2eContext.classAssignmentId },
    });
    // gradedCount in seed data is 2 (see seed-e2e.ts) — submissionCount below
    // that, and generatedAt outside the 24h cooldown, keeps "Regenerate"
    // available without needing a live AI call.
    await prisma.classAssignmentInsight.create({
      data: {
        classAssignmentId: e2eContext.classAssignmentId,
        status: 'ready',
        submissionCount: 1,
        summaryJson: FIXTURE_SUMMARY,
        generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function clearInsight(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId: e2eContext.classAssignmentId },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('teacher class summary full page', () => {
  test.afterEach(async ({ e2eContext }) => {
    await clearInsight(e2eContext);
  });

  test('opens class summary as a full page from the Documents tab, replacing the table with the class header intact', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await seedReadyInsight(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=documents&classAssignmentId=${e2eContext.classAssignmentId}`
    );
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('link', { name: /class performance summary/i })
      .click();

    // Forward navigation changes the URL — deep-linkable, not a sheet toggle.
    await page.waitForURL(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}?tab=documents&classAssignmentId=${e2eContext.classAssignmentId}`
    );

    // No dialog/sheet — this is embedded full-page content.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The class header stays mounted above the summary content.
    await expect(page.getByTestId('class-detail-header')).toBeVisible();
    // The documents table is gone, replaced by the summary panel.
    await expect(page.getByTestId('class-detail-table-panel')).toHaveCount(0);

    const summaryPage = page.getByTestId('class-summary-page');
    await expect(summaryPage).toBeVisible();

    // Content parity spot-checks against the panel's inventory.
    await expect(
      summaryPage.getByText(/how the class did/i)
    ).toBeVisible();
    await expect(
      summaryPage.getByRole('button', { name: /thesis.*strength/i })
    ).toBeVisible();
    await expect(
      summaryPage.getByRole('button', { name: /evidence.*needs work/i })
    ).toBeVisible();
    await expect(
      summaryPage.getByText(/suggested next steps/i)
    ).toBeVisible();
    await expect(
      summaryPage.getByText(/model evidence integration/i)
    ).toBeVisible();
    await expect(
      summaryPage.getByText(/differentiation starting points/i)
    ).toBeVisible();
    await expect(summaryPage.getByText('E2E Test Student')).toBeVisible();
    await expect(summaryPage.getByText(/based on 1 submission/i)).toBeVisible();

    // The regenerate control is present and enabled (seeded outside the
    // cooldown, with graded work newer than the cached summary) — this
    // exercises the control's availability logic without depending on a
    // live AI call, which is not configured in this environment.
    const regenerateButton = summaryPage.getByRole('button', {
      name: /regenerate/i,
    });
    await expect(regenerateButton).toBeVisible();
    await expect(regenerateButton).toBeEnabled();
  });

  test('browser back returns from the class summary page to the documents table', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await seedReadyInsight(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=documents&classAssignmentId=${e2eContext.classAssignmentId}`
    );
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('link', { name: /class performance summary/i })
      .click();
    await page.waitForURL(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}?tab=documents&classAssignmentId=${e2eContext.classAssignmentId}`
    );
    await expect(page.getByTestId('class-summary-page')).toBeVisible();

    await page.goBack();

    await expect(page).toHaveURL(
      new RegExp(`/app/my-classes/${e2eContext.classId}\\?tab=documents`)
    );
    await expect(page.getByTestId('class-detail-table-panel')).toBeVisible();
    await expect(page.getByTestId('class-summary-page')).toHaveCount(0);
    await expect(page.getByTestId('class-detail-header')).toBeVisible();

    await page.goForward();
    await expect(page.getByTestId('class-summary-page')).toBeVisible();
  });

  test('a deep link straight to the class summary page lands with the class header in place', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await seedReadyInsight(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('class-detail-header')).toBeVisible();
    const summaryPage = page.getByTestId('class-summary-page');
    await expect(summaryPage).toBeVisible();
    await expect(summaryPage.getByText(/how the class did/i)).toBeVisible();

    await summaryPage.getByRole('link', { name: /back to documents/i }).click();
    await expect(page.getByTestId('class-detail-table-panel')).toBeVisible();
  });

  test('the class summary panel swaps in instantly, without a slide animation, when the user prefers reduced motion', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await seedReadyInsight(e2eContext);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=documents&classAssignmentId=${e2eContext.classAssignmentId}`
    );
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('link', { name: /class performance summary/i })
      .click();
    await page.waitForURL(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}?tab=documents&classAssignmentId=${e2eContext.classAssignmentId}`
    );

    const panel = page.getByTestId('assignment-detail-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS('animation-name', 'none');
  });
});
