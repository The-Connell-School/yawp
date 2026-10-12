import { beforeEach, describe, expect, mock, test } from 'bun:test';

const catalogList = mock(async () => ({ rubrics: [] as object[] }));

mock.module('./rubric-catalog.server', () => ({
  RubricCatalog: class {
    constructor(_db: unknown) {}
    list = catalogList;
  },
  perTypeKey: (id: string) => `assignment-type:${id}`,
  perTypeContent: (type: {
    id: string;
    title: string | null;
    scoringScaleJson: unknown;
    rubricJson: unknown;
    gradingPromptConfigJson: unknown;
    gradingOutputSchemaJson: unknown;
    gradingCalibrationNotes: string | null;
  }) => ({
    name: `assignment-type:${type.id}`,
    title: type.title ?? `assignment-type:${type.id}`,
    scoringScale: type.scoringScaleJson ?? {},
    rubric: type.rubricJson ?? {},
    promptConfig: type.gradingPromptConfigJson ?? {},
    outputSchema: type.gradingOutputSchemaJson ?? {},
    calibrationNotes: type.gradingCalibrationNotes,
  }),
}));

const rubricRelease = { findMany: mock(), findUnique: mock() };
const rubric = { findMany: mock(), findFirst: mock() };
const assignmentType = { findMany: mock(), findUnique: mock() };

mock.module('~/utils/db.server', () => ({
  prisma: { rubricRelease, rubric, assignmentType },
}));

const {
  listLiveRubricsForAdminPicker,
  resolveAdminRubricPickerSelection,
  ADMIN_PER_TYPE_PICKER_PREFIX,
} = await import('./admin-rubric-picker.server');

const db = { rubricRelease, rubric, assignmentType };

const validLibrarySchema = {
  name: 'daily-pages-engagement',
  title: 'Daily Pages engagement',
  scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 100 },
  rubric: {
    categories: [
      {
        key: 'engagement_with_prompt',
        label: 'Engagement',
        description: 'Engagement',
        weight: 1,
      },
    ],
  },
  promptConfig: { gradingInstructions: 'Grade engagement.' },
  outputSchema: { schemaVersion: 1, responseShape: 'categories_overall_comment' },
  calibrationNotes: null,
};

describe('listLiveRubricsForAdminPicker', () => {
  beforeEach(() => {
    catalogList.mockReset();
    rubricRelease.findMany.mockReset();
    rubric.findMany.mockReset();
    assignmentType.findMany.mockReset();
    rubricRelease.findMany.mockResolvedValue([]);
    rubric.findMany.mockImplementation(async (args: { where?: { archivedAt?: unknown; name?: { in: string[] } } }) => {
      if (args?.where?.archivedAt) return [];
      if (args?.where?.name?.in) {
        return [
          {
            id: 'lib-1',
            name: 'daily-pages-engagement',
            title: 'Daily Pages engagement',
            schemaJson: validLibrarySchema,
          },
        ];
      }
      return [];
    });
    assignmentType.findMany.mockResolvedValue([]);
  });

  test('lists library and per-type entries when RubricRelease is empty', async () => {
    catalogList.mockResolvedValue({
      rubrics: [
        {
          key: 'daily-pages-engagement',
          source: 'library',
          name: 'daily-pages-engagement',
          title: 'Daily Pages engagement',
          editable: true,
        },
        {
          key: 'assignment-type:type-1',
          source: 'assignment-type',
          name: 'assignment-type:type-1',
          title: 'Thesis lab',
          editable: true,
        },
        {
          key: 'assignment-type:empty',
          source: 'assignment-type',
          name: 'assignment-type:empty',
          title: 'Empty',
          editable: false,
        },
      ],
    });
    assignmentType.findMany.mockResolvedValue([
      {
        id: 'type-1',
        title: 'Thesis lab',
        scoringScaleJson: { minScore: 0, maxScore: 5 },
        rubricJson: validLibrarySchema.rubric,
        gradingPromptConfigJson: {},
        gradingOutputSchemaJson: validLibrarySchema.outputSchema,
        gradingCalibrationNotes: null,
      },
    ]);

    const options = await listLiveRubricsForAdminPicker(db as never);
    expect(options.map((row) => row.catalogKey).sort()).toEqual([
      'assignment-type:type-1',
      'daily-pages-engagement',
    ]);
    expect(rubricRelease.findMany).toHaveBeenCalled();
  });

  test('excludes archived and retired library rubrics', async () => {
    catalogList.mockResolvedValue({
      rubrics: [
        {
          key: 'daily-pages-engagement',
          source: 'library',
          name: 'daily-pages-engagement',
          title: 'Daily Pages engagement',
          editable: true,
        },
        {
          key: 'daily-pages-reflection',
          source: 'library',
          name: 'daily-pages-reflection',
          title: 'Reflection',
          editable: true,
        },
      ],
    });
    rubric.findMany.mockImplementation(async (args: { where?: { archivedAt?: unknown; name?: { in: string[] } } }) => {
      if (args?.where?.archivedAt) {
        return [{ name: 'daily-pages-reflection' }];
      }
      if (args?.where?.name?.in) {
        return [
          {
            id: 'lib-1',
            name: 'daily-pages-engagement',
            title: 'Daily Pages engagement',
            schemaJson: validLibrarySchema,
          },
          {
            id: 'lib-2',
            name: 'daily-pages-reflection',
            title: 'Reflection',
            schemaJson: validLibrarySchema,
          },
        ];
      }
      return [];
    });

    const options = await listLiveRubricsForAdminPicker(db as never);
    expect(options).toHaveLength(1);
    expect(options[0]?.name).toBe('daily-pages-engagement');
  });

  test('prefers RubricRelease revision content when present', async () => {
    catalogList.mockResolvedValue({
      rubrics: [
        {
          key: 'daily-pages-engagement',
          source: 'library',
          name: 'daily-pages-engagement',
          title: 'Daily Pages engagement',
          editable: true,
        },
      ],
    });
    rubricRelease.findMany.mockResolvedValue([
      {
        catalogKey: 'daily-pages-engagement',
        rubricRevision: {
          schemaJson: {
            ...validLibrarySchema,
            calibrationNotes: 'Released copy',
          },
        },
      },
    ]);

    const options = await listLiveRubricsForAdminPicker(db as never);
    expect(options[0]?.json).toContain('Released copy');
  });
});

describe('resolveAdminRubricPickerSelection', () => {
  beforeEach(() => {
    rubricRelease.findMany.mockReset();
    rubricRelease.findUnique.mockReset();
    rubric.findFirst.mockReset();
    assignmentType.findUnique.mockReset();
    rubricRelease.findMany.mockResolvedValue([]);
  });

  test('accepts library rubrics without a RubricRelease row', async () => {
    rubric.findFirst.mockResolvedValue({
      id: 'lib-1',
      name: 'daily-pages-engagement',
      schemaJson: validLibrarySchema,
    });
    await expect(resolveAdminRubricPickerSelection('lib-1', db as never)).resolves.toEqual({
      kind: 'library',
      rubricId: 'lib-1',
      catalogKey: 'daily-pages-engagement',
    });
  });

  test('copies per-type live columns without a release', async () => {
    const typeId = 'type-1';
    const catalogKey = `${ADMIN_PER_TYPE_PICKER_PREFIX}${typeId}`;
    assignmentType.findUnique.mockResolvedValue({
      id: typeId,
      archivedAt: null,
      rubricId: null,
      title: 'Thesis lab',
      scoringScaleJson: { minScore: 0, maxScore: 5 },
      rubricJson: validLibrarySchema.rubric,
      gradingPromptConfigJson: { gradingInstructions: 'Copy me' },
      gradingOutputSchemaJson: validLibrarySchema.outputSchema,
      gradingCalibrationNotes: 'notes',
    });

    const resolved = await resolveAdminRubricPickerSelection(catalogKey, db as never);
    expect(resolved.kind).toBe('per-type');
    if (resolved.kind === 'per-type') {
      expect(resolved.assignmentTypeData.rubricId).toBeNull();
      expect(resolved.assignmentTypeData.gradingCalibrationNotes).toBe('notes');
      expect(resolved.assignmentTypeData.gradingPromptConfigJson).toMatchObject({
        gradingInstructions: 'Copy me',
      });
    }
  });

  test('rejects archived per-type sources', async () => {
    assignmentType.findUnique.mockResolvedValue({
      id: 'type-1',
      archivedAt: new Date(),
      rubricId: null,
      title: 'Gone',
      rubricJson: validLibrarySchema.rubric,
      scoringScaleJson: {},
      gradingPromptConfigJson: {},
      gradingOutputSchemaJson: {},
      gradingCalibrationNotes: null,
    });
    await expect(
      resolveAdminRubricPickerSelection(
        `${ADMIN_PER_TYPE_PICKER_PREFIX}type-1`,
        db as never
      )
    ).rejects.toMatchObject({ status: 400 });
  });
});
