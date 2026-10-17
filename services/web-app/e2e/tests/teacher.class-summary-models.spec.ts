import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';
import { setClassSummaryModelsFlag } from '../feature-flags';

const MODEL_DOC_TITLE = 'E2E class models contrast doc';
const MODEL_DOC_TEXT =
  'Organization carries this paragraph: each claim leads to the next, and the closing line returns to the opening question.';

const FIXTURE_SUMMARY = {
  overview: 'The class wrote clear theses but uneven organization.',
  categories: [
    {
      key: 'organization_and_structure',
      label: 'Organization & Structure',
      status: 'gap',
      summary: 'Paragraphs often lacked a clear order.',
    },
  ],
  nextSteps: [],
};

/**
 * A ready summary, plus one extra graded paper scored as the mirror image of
 * the seeded graded document — so every category has both a strong model and
 * a low score to learn from.
 */
async function seed(e2eContext: E2EContext) {
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
        summaryJson: FIXTURE_SUMMARY,
        generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });
    const document = await prisma.document.create({
      data: {
        title: MODEL_DOC_TITLE,
        text: MODEL_DOC_TEXT,
        html: `<p>${MODEL_DOC_TEXT}</p>`,
        revision: 1,
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        assignmentId: e2eContext.assignmentId,
        classAssignmentId: e2eContext.classAssignmentId,
      },
      select: { id: true },
    });
    await prisma.submission.create({
      data: {
        documentId: document.id,
        html: `<p>${MODEL_DOC_TEXT}</p>`,
        text: MODEL_DOC_TEXT,
        title: MODEL_DOC_TITLE,
        submittedAt: new Date(),
        gradedByMembershipId: e2eContext.teacherMembershipId,
        gradedAt: new Date(),
        rubricScores: {
          thesis_and_content: 1,
          organization_and_structure: 5,
          evidence_and_support: 1,
          voice_and_style: 5,
          grammar_and_mechanics: 5,
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanup(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId: e2eContext.classAssignmentId },
    });
    const documents = await prisma.document.findMany({
      where: { title: MODEL_DOC_TITLE },
      select: { id: true },
    });
    const ids = documents.map((document) => document.id);
    await prisma.submission.deleteMany({ where: { documentId: { in: ids } } });
    await prisma.document.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('teacher class summary: models to teach from', () => {
  test.afterEach(async ({ e2eContext }) => {
    await cleanup(e2eContext);
    await setClassSummaryModelsFlag(false);
  });

  test('pairs a strong model with an instructive example and questions to think through', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setClassSummaryModelsFlag(true);
    await seed(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('class-models-section');
    await expect(section).toBeVisible();
    await expect(
      section.getByRole('heading', { name: /models to teach from/i })
    ).toBeVisible();

    await section
      .getByRole('button', { name: /find models to teach from/i })
      .click();

    const focus = section.getByTestId('class-models-focus').first();
    await expect(focus).toBeVisible();
    await expect(focus.getByText(/show what works/i)).toBeVisible();
    await expect(focus.getByText(/learn from together/i)).toBeVisible();
    // Both sides quote real student work and link to the full paper.
    await expect(
      focus.getByTestId('class-models-exemplar').getByRole('link')
    ).toHaveAttribute('href', /\/app\/submissions\//);
    await expect(
      focus.getByTestId('class-models-instructive').getByRole('link')
    ).toHaveAttribute('href', /\/app\/submissions\//);
    // Questions for the teacher, including a reminder about sharing.
    await expect(focus.getByText(/remove the student’s name/i)).toBeVisible();
  });

  test('is absent while the flag is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setClassSummaryModelsFlag(false);
    await seed(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('class-summary-page')).toBeVisible();
    await expect(page.getByText(/how the class did/i)).toBeVisible();
    await expect(page.getByTestId('class-models-section')).toHaveCount(0);
  });
});
