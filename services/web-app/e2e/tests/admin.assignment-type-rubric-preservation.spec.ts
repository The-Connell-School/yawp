import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

/**
 * Checking an assignment type in Admin → Assignment Types has to be safe.
 *
 * The five types the Grading Assistant leans on hardest each keep their rubric
 * somewhere different: Exit Ticket and the Thesis-Driven Essay grade from the
 * built-in rubric for their kind, while Class Starter, Pre-Writing and Thesis
 * Statement carry their own rubric with score words and grammar settings. An
 * admin opening one of them and pressing Update without touching the rubric
 * must leave every grading column exactly as it was.
 */

const OOPS = /Oops! Something didn't work quite right/i;

const GRADING_COLUMNS = {
  title: true,
  rubricId: true,
  rubricJson: true,
  scoringScaleJson: true,
  gradingPromptConfigJson: true,
  gradingOutputSchemaJson: true,
  gradingCalibrationNotes: true,
  gradingAssistantVersion: true,
} as const;

const FIVE_TYPES = [
  { name: 'Thesis-Driven Essay', where: { title: 'The Thesis-Driven Essay' } },
  { name: 'Pre-Writing', where: { kind: 'prewriting' } },
  { name: 'Thesis Statement', where: { kind: 'thesis_statement' } },
  { name: 'Class Starter', where: { kind: 'class_starter' } },
  { name: 'Exit Ticket', where: { kind: 'exit_ticket' } },
] as const;

type GradingColumns = {
  id: string;
  title: string;
  rubricId: string | null;
  rubricJson: unknown;
  scoringScaleJson: unknown;
  gradingPromptConfigJson: unknown;
  gradingOutputSchemaJson: unknown;
  gradingAssistantVersion: number;
};

function jsonOrNull(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** Put the seeded type back exactly, NULL columns included. */
async function restoreGradingColumns(
  prisma: ReturnType<typeof createE2EPrismaClient>,
  before: GradingColumns
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "AssignmentType"
        SET "title" = $2,
            "rubricId" = $3,
            "rubricJson" = $4::jsonb,
            "scoringScaleJson" = $5::jsonb,
            "gradingPromptConfigJson" = $6::jsonb,
            "gradingOutputSchemaJson" = $7::jsonb,
            "gradingAssistantVersion" = $8
      WHERE id = $1`,
    before.id,
    before.title,
    before.rubricId,
    jsonOrNull(before.rubricJson),
    jsonOrNull(before.scoringScaleJson),
    jsonOrNull(before.gradingPromptConfigJson),
    jsonOrNull(before.gradingOutputSchemaJson),
    before.gradingAssistantVersion
  );
}

test.describe('Admin assignment type rubric preservation', () => {
  for (const type of FIVE_TYPES) {
    test(`saving ${type.name} without touching its rubric keeps its grading config`, async ({
      page,
      signIn,
    }) => {
      test.setTimeout(90_000);
      const prisma = createE2EPrismaClient();
      const before = await prisma.assignmentType.findFirstOrThrow({
        where: { ...type.where, archivedAt: null },
        select: { id: true, ...GRADING_COLUMNS },
      });
      const checkedTitle = `${before.title} (checked)`;

      try {
        await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
        await page.goto(`/app/admin/assignment-types/${before.id}`);
        await expect(page.getByTestId('rubric-library-select')).toBeVisible();
        await expect(page.getByText(OOPS)).toHaveCount(0);

        await page.locator('input[name="title"]').fill(checkedTitle);
        const saved = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response
              .url()
              .includes(`/app/admin/assignment-types/${before.id}.data`)
        );
        await page.getByRole('button', { name: 'Update', exact: true }).click();
        expect((await saved).ok()).toBe(true);
        await expect(page.getByText(OOPS)).toHaveCount(0);

        const after = await prisma.assignmentType.findUniqueOrThrow({
          where: { id: before.id },
          select: GRADING_COLUMNS,
        });
        expect(after.title).toBe(checkedTitle);
        expect(after.rubricId).toBe(before.rubricId);
        expect(after.rubricJson).toEqual(before.rubricJson);
        expect(after.scoringScaleJson).toEqual(before.scoringScaleJson);
        expect(after.gradingOutputSchemaJson).toEqual(
          before.gradingOutputSchemaJson
        );
        expect(after.gradingCalibrationNotes).toBe(
          before.gradingCalibrationNotes
        );
        expect(after.gradingAssistantVersion).toBe(
          before.gradingAssistantVersion
        );
        // A title-only save may stamp who last edited it, but nothing a
        // grader reads may change.
        const { _lastAdminEdit: _ignored, ...promptAfter } =
          (after.gradingPromptConfigJson ?? {}) as Record<string, unknown>;
        const { _lastAdminEdit: _ignoredBefore, ...promptBefore } =
          (before.gradingPromptConfigJson ?? {}) as Record<string, unknown>;
        expect(promptAfter).toEqual(promptBefore);
      } finally {
        await restoreGradingColumns(prisma, before);
        await prisma.$disconnect();
      }
    });
  }

  test('switching grammar highlighting on keeps the rubric score words and feedback settings', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(90_000);
    const prisma = createE2EPrismaClient();
    const before = await prisma.assignmentType.findFirstOrThrow({
      where: { kind: 'prewriting', archivedAt: null },
      select: { id: true, ...GRADING_COLUMNS },
    });

    try {
      const storedCategories = (
        before.rubricJson as { categories: Array<Record<string, unknown>> }
      ).categories;
      expect(storedCategories[0]?.grammarHighlighting).toBe(false);
      expect(storedCategories[0]?.scoreLabels).toBeTruthy();

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${before.id}`);
      const grammarSwitch = page.getByTestId('rubric-grammar-highlighting');
      await expect(grammarSwitch).toHaveAttribute('aria-checked', 'false');
      await grammarSwitch.click();
      await expect(grammarSwitch).toHaveAttribute('aria-checked', 'true');

      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes(`/app/admin/assignment-types/${before.id}.data`)
      );
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      expect((await saved).ok()).toBe(true);

      const after = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: before.id },
        select: { rubricJson: true },
      });
      const savedCategories = (
        after.rubricJson as { categories: Array<Record<string, unknown>> }
      ).categories;
      expect(savedCategories).toEqual(
        storedCategories.map((category) => ({
          ...category,
          grammarHighlighting: true,
        }))
      );
    } finally {
      await restoreGradingColumns(prisma, before);
      await prisma.$disconnect();
    }
  });

  test('each type shows the rubric the Grading Assistant actually grades with', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(90_000);
    const prisma = createE2EPrismaClient();
    try {
      const ids = Object.fromEntries(
        await Promise.all(
          FIVE_TYPES.map(async (type) => [
            type.name,
            (
              await prisma.assignmentType.findFirstOrThrow({
                where: { ...type.where, archivedAt: null },
                select: { id: true },
              })
            ).id,
          ])
        )
      ) as Record<(typeof FIVE_TYPES)[number]['name'], string>;

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');

      await page.goto(`/app/admin/assignment-types/${ids['Exit Ticket']}`);
      const exitTicket = page.getByTestId('grading-rubric-summary');
      await expect(exitTicket).toBeVisible();
      await expect(page.getByTestId('grading-rubric-source')).toHaveText(
        'Built-in rubric: Exit Ticket understanding'
      );
      await expect(page.getByTestId('grading-rubric-scale')).toHaveText(
        'Rubric points, 0–100'
      );
      await expect(exitTicket.getByTestId('grading-rubric-level')).toHaveText([
        '0 · No evidence',
        '1–44 · Names it only',
        '45–80 · Partly there',
        '81–100 · Explains it',
      ]);
      await expect(
        page.getByText('This assignment type uses its built-in rubric.')
      ).toHaveCount(0);

      await page.goto(`/app/admin/assignment-types/${ids['Pre-Writing']}`);
      await expect(page.getByTestId('grading-rubric-source')).toHaveText(
        "This type's own rubric"
      );
      await expect(page.getByTestId('grading-rubric-scale')).toHaveText(
        'Weighted 1–5, 1–5'
      );
      await expect(
        page.getByTestId('grading-rubric-summary').getByTestId('grading-rubric-category')
      ).toHaveText(['Focus and exploration · 100%']);

      await page.goto(`/app/admin/assignment-types/${ids['Class Starter']}`);
      await expect(page.getByTestId('grading-rubric-source')).toHaveText(
        "This type's own rubric"
      );
      await expect(page.getByTestId('grading-rubric-scale')).toHaveText(
        'Points, 0–3'
      );
      await expect(
        page.getByTestId('grading-rubric-summary').getByTestId('grading-rubric-level')
      ).toHaveText(['0 · Absent', '1 · Hardly there', '2 · Showed up', '3 · All in']);

      await page.goto(
        `/app/admin/assignment-types/${ids['Thesis-Driven Essay']}`
      );
      await expect(page.getByTestId('grading-rubric-source')).toHaveText(
        'Built-in rubric: Thesis-driven essay grading assistant'
      );
      await expect(
        page.getByTestId('grading-rubric-summary').getByTestId('grading-rubric-category')
      ).toHaveCount(5);
    } finally {
      await prisma.$disconnect();
    }
  });
});
