import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';
import {
  setAssignmentSummaryModelsFlag,
  setAssignmentSummaryPlannerFlag,
} from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const MODEL_DOC_TITLE = 'E2E summary planner model doc';

const FIXTURE_SUMMARY = {
  overview: 'Strong evidence, but most theses restate the plot.',
  categories: [
    {
      key: 'thesis_and_content',
      label: 'Thesis/Content',
      status: 'gap',
      summary: 'Most theses restate the plot instead of making a claim.',
    },
    {
      key: 'evidence_and_support',
      label: 'Evidence/Support',
      status: 'strength',
      summary: 'Quotes are well chosen and well introduced.',
    },
  ],
  nextSteps: [
    {
      title: 'Turn a topic into a claim',
      detail: 'Model moving from "this essay is about" to "this essay argues".',
      rubricCategory: 'thesis_and_content',
    },
  ],
  differentiation: {
    focusGroups: [
      {
        category: 'evidence_and_support',
        label: 'Evidence/Support',
        students: [
          { name: 'Ben Ortiz', href: null },
          { name: 'Ana Reyes', href: null },
        ],
      },
    ],
    individuals: [
      {
        kind: 'extension',
        student: { name: 'Dara Lin', href: null },
        categoryLabels: [],
      },
    ],
  },
};

async function seedSummary(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId: e2eContext.classAssignmentId },
    });
    await prisma.classAssignmentInsight.create({
      data: {
        classAssignmentId: e2eContext.classAssignmentId,
        status: 'ready',
        submissionCount: 3,
        summaryJson: FIXTURE_SUMMARY,
        generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A strong paper that names its writer, so the hand-off has to scrub it.
 */
async function seedNamedModel(e2eContext: E2EContext): Promise<string> {
  const prisma = createE2EPrismaClient();
  try {
    const membership = await prisma.orgMembership.findUniqueOrThrow({
      where: { id: e2eContext.membershipId },
      select: { user: { select: { name: true, email: true } } },
    });
    const name =
      membership.user?.name?.trim() || membership.user?.email || 'Student';
    const text = `${name}. Romeo and Juliet argues that haste, not fate, destroys the lovers.`;
    const document = await prisma.document.create({
      data: {
        title: MODEL_DOC_TITLE,
        text,
        html: `<p>${text}</p>`,
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
        html: `<p>${text}</p>`,
        text,
        title: MODEL_DOC_TITLE,
        submittedAt: new Date(),
        gradedByMembershipId: e2eContext.teacherMembershipId,
        gradedAt: new Date(),
        // Strong everywhere, so whichever skill the class is weakest in, this
        // paper is its model.
        rubricScores: {
          thesis_and_content: 5,
          organization_and_structure: 5,
          evidence_and_support: 5,
          voice_and_style: 5,
          grammar_and_mechanics: 5,
        },
      },
    });
    return name;
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

test.describe('teacher assignment summary → lesson planner', () => {
  test.afterEach(async ({ e2eContext }) => {
    await cleanup(e2eContext);
    await setAssignmentSummaryPlannerFlag(false);
    await setAssignmentSummaryModelsFlag(false);
  });

  test('a rubric category opens the planner with everything the summary says about it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setAssignmentSummaryPlannerFlag(true);
    await seedSummary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await expect(page.getByText(/how the class did/i)).toBeVisible();

    await page.getByRole('link', { name: /teach this skill/i }).click();

    // Ids in the URL, not prompt text.
    await expect(page).toHaveURL(
      new RegExp(
        `/app/lesson-planner\\?from=${e2eContext.classAssignmentId}&seed=category%3Athesis_and_content`
      )
    );
    const banner = page.getByTestId('lesson-planner-seed');
    await expect(banner).toContainText(/from your assignment summary/i);
    await expect(page.getByTestId('lesson-planner-seed-chips')).toContainText(
      'Thesis/Content · area to grow'
    );
    await expect(page.getByTestId('lesson-planner-seed-chips')).toContainText(
      'Next step: Turn a topic into a claim'
    );
    const composer = page.getByLabel('Message the Lesson Planner');
    await expect(composer).toHaveValue(
      /Most theses restate the plot instead of making a claim\./
    );
    await expect(composer).toHaveValue(/whole-class mini-lesson/);
    // Pre-filled, not sent: the teacher adds their own context first.
    await expect(page.locator('[data-role="user"]')).toHaveCount(0);
  });

  test('a small group opens a pull-aside by size, never by name', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setAssignmentSummaryPlannerFlag(true);
    await seedSummary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await page.getByRole('link', { name: /plan a pull-aside/i }).click();

    const composer = page.getByLabel('Message the Lesson Planner');
    await expect(composer).toHaveValue(/2 students scored low on Evidence\/Support/);
    await expect(composer).toHaveValue(/pull-aside/);
    await expect(composer).not.toHaveValue(/Ben Ortiz|Ana Reyes/);
  });

  test('models open the planner with the strong paper word for word and no name', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setAssignmentSummaryPlannerFlag(true);
    await setAssignmentSummaryModelsFlag(true);
    await seedSummary(e2eContext);
    const name = await seedNamedModel(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    const section = page.getByTestId('class-models-section');
    await section
      .getByRole('button', { name: /find models to teach from/i })
      .click();
    await section
      .getByRole('link', { name: /plan a lesson from these/i })
      .first()
      .click();

    await expect(page).toHaveURL(/seed=models%3A/);
    const composer = page.getByLabel('Message the Lesson Planner');
    await expect(composer).toHaveValue(/Student A: "/);
    await expect(composer).toHaveValue(/student-inspired weaker versions/);
    const value = await composer.inputValue();
    for (const part of name.split(/[\s@._-]+/).filter((p) => p.length >= 2)) {
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(value).not.toMatch(new RegExp(`\\b${escaped}\\b`, 'i'));
    }
  });

  test('only the original next-step link while the flag is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setAssignmentSummaryPlannerFlag(false);
    await seedSummary(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(
      `/app/my-classes/${e2eContext.classId}/summary/${e2eContext.assignmentId}`
    );
    await expect(page.getByText(/how the class did/i)).toBeVisible();
    await expect(page.locator('a[data-handoff]')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /plan this lesson/i })
    ).toHaveAttribute(
      'href',
      `/app/lesson-planner?from=${e2eContext.classAssignmentId}&step=0`
    );

    // A hand-off link from before the flag went off just opens a blank planner.
    await page.goto(
      `/app/lesson-planner?from=${e2eContext.classAssignmentId}&seed=summary`
    );
    await expect(page.getByTestId('lesson-planner-seed')).toHaveCount(0);
    await expect(page.getByLabel('Message the Lesson Planner')).toHaveValue('');
  });
});
