import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { currentSchoolYear } from '../../app/utils/school-year';
import type { E2EContext } from '../seed-e2e';

/**
 * The same assignment run in two sections. An Assignment is one row joined to
 * each class through ClassAssignment, and each ClassAssignment carries its own
 * cached summary — so "this assignment across my sections" means two summaries
 * sharing one assignmentId. The second section here is deliberately lopsided
 * (3 submissions against 24, and a rubric category it disagrees with the first
 * section on) so the combined view has something it must not smooth over.
 */

const BIG_SECTION_SUMMARY = {
  overview: 'Period 1 held the thesis and mostly integrated evidence.',
  categories: [
    {
      key: 'thesis',
      label: 'Thesis',
      status: 'strength',
      summary: 'Clear, arguable claims throughout.',
    },
    {
      key: 'evidence',
      label: 'Evidence',
      status: 'strength',
      summary: 'Quotes are introduced and analyzed.',
    },
  ],
  nextSteps: [
    {
      title: 'Model evidence integration',
      detail: 'Show a mentor paragraph that blends quote and analysis.',
      rubricCategory: 'evidence',
    },
  ],
};

const SMALL_SECTION_SUMMARY = {
  overview: 'The handful of submissions from this section leaned on summary.',
  categories: [
    {
      key: 'thesis',
      label: 'Thesis',
      status: 'strength',
      summary: 'Claims are arguable.',
    },
    {
      key: 'evidence',
      label: 'Evidence',
      status: 'gap',
      summary: 'Quotes are dropped in without analysis.',
    },
  ],
  nextSteps: [
    {
      title: 'Model evidence integration',
      detail: 'Show a mentor paragraph that blends quote and analysis.',
      rubricCategory: 'evidence',
    },
  ],
};

type SecondSection = { classId: string; classAssignmentId: string };

async function seedSecondSection(
  e2eContext: E2EContext
): Promise<SecondSection> {
  const prisma = createE2EPrismaClient();
  try {
    const suffix = Date.now().toString(36);
    const klass = await prisma.class.create({
      data: {
        code: `SECTIONS-${suffix}`.toUpperCase(),
        schoolYear: currentSchoolYear(),
        // Sorts after the seeded class's "1st" period, so Period 1 stays first.
        period: 'Sections QA',
        grade: '9th',
        schoolId: e2eContext.schoolId,
        teachers: { connect: { id: e2eContext.teacherMembershipId } },
      },
      select: { id: true },
    });

    // Same Assignment, second class — this is what "across sections" means.
    const classAssignment = await prisma.classAssignment.create({
      data: { assignmentId: e2eContext.assignmentId, classId: klass.id },
      select: { id: true },
    });

    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId: e2eContext.classAssignmentId },
    });
    await prisma.classAssignmentInsight.createMany({
      data: [
        {
          classAssignmentId: e2eContext.classAssignmentId,
          status: 'ready',
          submissionCount: 24,
          summaryJson: BIG_SECTION_SUMMARY,
          generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
        {
          classAssignmentId: classAssignment.id,
          status: 'ready',
          submissionCount: 3,
          summaryJson: SMALL_SECTION_SUMMARY,
          generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      ],
    });

    return { classId: klass.id, classAssignmentId: classAssignment.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function clearSecondSection(
  e2eContext: E2EContext,
  section: SecondSection | null
) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId: e2eContext.classAssignmentId },
    });
    if (section) {
      // ClassAssignment and its insight cascade off the class.
      await prisma.class.deleteMany({ where: { id: section.classId } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('teacher class summary across sections', () => {
  let section: SecondSection | null = null;

  test.afterEach(async ({ e2eContext }) => {
    await clearSecondSection(e2eContext, section);
    section = null;
  });

  test('a teacher opts into reading one assignment across both sections, then back to one', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    section = await seedSecondSection(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await page.waitForLoadState('networkidle');

    const summaryPage = page.getByTestId('class-summary-page');
    await expect(summaryPage).toBeVisible();

    // Single class is the default — nothing about the other section yet.
    await expect(page.getByTestId('across-sections-panel')).toHaveCount(0);
    await expect(summaryPage.getByText(/based on 24 submissions/i)).toBeVisible();

    const toggle = page.getByTestId('class-summary-scope-toggle');
    await expect(toggle).toBeVisible();
    const allSections = page.getByTestId('class-summary-scope-all-sections');
    await expect(allSections).toHaveText(/all 2 sections/i);
    await expect(
      page.getByTestId('class-summary-scope-this-class')
    ).toHaveAttribute('aria-current', 'true');

    await allSections.click();
    await page.waitForURL(/sections=all/);

    const across = page.getByTestId('across-sections-panel');
    await expect(across).toBeVisible();
    await expect(page.getByTestId('across-sections-subtitle')).toContainText(
      /2 of 2 sections summarized/i
    );
    await expect(page.getByTestId('across-sections-subtitle')).toContainText(
      /27 submissions in total/i
    );

    // Each section's own contribution is on the page, not averaged away.
    const cards = page.getByTestId('across-sections-coverage-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Period 1st');
    await expect(cards.nth(0)).toContainText('24');
    await expect(cards.nth(1)).toContainText('Period Sections QA');
    await expect(cards.nth(1)).toContainText('3');

    // The lopsided section is called out, by name and by count.
    const warning = page.getByTestId('across-sections-coverage-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/Period Sections QA \(3 submissions\)/);
    await expect(page.getByTestId('section-thin-badge')).toHaveCount(1);

    // Agreement and disagreement read differently.
    const thesis = across.locator('[data-category-key="thesis"]');
    await expect(thesis).toHaveAttribute('data-agreement', 'agreed');
    await expect(thesis).toContainText(/strength in every section/i);

    const evidence = across.locator('[data-category-key="evidence"]');
    await expect(evidence).toHaveAttribute('data-agreement', 'split');
    await expect(evidence).toContainText(/split across sections/i);
    // The bigger section does not get to speak for the smaller one.
    await expect(evidence).toContainText(/24 submissions/);
    await expect(evidence).toContainText(/3 submissions/);

    // A step both sections raised is merged and attributed to both.
    const step = page.getByTestId('across-sections-next-step').first();
    await expect(step).toContainText(/model evidence integration/i);
    await expect(step).toContainText(
      /raised in Grade 9th · Period 1st, Grade 9th · Period Sections QA/i
    );

    // And back to the single class.
    await page.getByTestId('class-summary-scope-this-class').click();
    await expect(page).not.toHaveURL(/sections=all/);
    await expect(page.getByTestId('across-sections-panel')).toHaveCount(0);
    await expect(summaryPage.getByText(/based on 24 submissions/i)).toBeVisible();
  });

  test('a deep link with the across-sections param lands on the combined view', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    section = await seedSecondSection(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}?sections=all`
    );
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('across-sections-panel')).toBeVisible();
    await expect(page.getByTestId('class-detail-header')).toBeVisible();
    await expect(
      page.getByTestId('class-summary-scope-all-sections')
    ).toHaveAttribute('aria-current', 'true');

    // The teacher is never stranded in the combined view.
    await page.getByRole('link', { name: /back to documents/i }).click();
    await expect(page.getByTestId('class-detail-table-panel')).toBeVisible();
  });

  test('no scope toggle appears when the assignment runs in one class only', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.classAssignmentInsight.deleteMany({
        where: { classAssignmentId: e2eContext.classAssignmentId },
      });
      await prisma.classAssignmentInsight.create({
        data: {
          classAssignmentId: e2eContext.classAssignmentId,
          status: 'ready',
          submissionCount: 1,
          summaryJson: BIG_SECTION_SUMMARY,
          generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('class-summary-page')).toBeVisible();
    await expect(page.getByTestId('class-summary-scope-toggle')).toHaveCount(0);
    await expect(page.getByTestId('across-sections-panel')).toHaveCount(0);
  });
});
