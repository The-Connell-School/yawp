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

const rubric = { findMany: mock(), findFirst: mock() };
const assignmentType = { findMany: mock(), findUnique: mock() };

mock.module('~/utils/db.server', () => ({
  prisma: { rubric, assignmentType },
}));

const {
  listLiveRubricsForAdminPicker,
  resolveAdminRubricPickerSelection,
  ADMIN_PER_TYPE_PICKER_PREFIX,
} = await import('./admin-rubric-picker.server');

const db = { rubric, assignmentType };

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
    rubric.findMany.mockReset();
    assignmentType.findMany.mockReset();
    rubric.findMany.mockImplementation(async (args: { where?: { archivedAt?: unknown; name?: { in: string[] } } }) => {
      if (args?.where?.archivedAt) return [];
      if (args?.where?.name?.in) {
        return [
          {
            id: 'lib-1',
            name: 'daily-pages-engagement',
            title: 'Daily Pages engagement',
            schemaJson: validLibrarySchema,
            currentRevision: null,
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
  });

  test('does not emit duplicate titles', async () => {
    catalogList.mockResolvedValue({
      rubrics: [
        {
          key: 'thesis-driven-essay',
          source: 'library',
          name: 'thesis-driven-essay',
          title: 'Thesis-driven essay grading assistant',
          editable: true,
        },
        {
          key: 'class-starter-engagement',
          source: 'library',
          name: 'class-starter-engagement',
          title: 'Class Starter engagement',
          editable: true,
        },
      ],
    });
    rubric.findMany.mockImplementation(async (args: { where?: { archivedAt?: unknown; name?: { in: string[] } } }) => {
      if (args?.where?.archivedAt) return [];
      if (args?.where?.name?.in) {
        return args.where.name.in.map((name, index) => ({
          id: `lib-${index}`,
          name,
          title:
            name === 'thesis-driven-essay'
              ? 'Thesis-driven essay grading assistant'
              : 'Class Starter engagement',
          schemaJson: validLibrarySchema,
          currentRevision: null,
        }));
      }
      return [];
    });

    const options = await listLiveRubricsForAdminPicker(db as never);
    const titles = options.map((row) => row.title);
    expect(new Set(titles).size).toBe(titles.length);
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
    expect(options.filter((row) => row.source === 'library')).toHaveLength(1);
    expect(options.find((row) => row.name === 'daily-pages-engagement')?.source).toBe(
      'library'
    );
  });

  test('prefers currentRevision over draft schemaJson for library rows', async () => {
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
    rubric.findMany.mockImplementation(async (args: { where?: { archivedAt?: unknown; name?: { in: string[] } } }) => {
      if (args?.where?.archivedAt) return [];
      if (args?.where?.name?.in) {
        return [
          {
            id: 'lib-1',
            name: 'daily-pages-engagement',
            title: 'Daily Pages engagement',
            schemaJson: { ...validLibrarySchema, calibrationNotes: 'Draft copy' },
            currentRevision: {
              schemaJson: {
                ...validLibrarySchema,
                calibrationNotes: 'Published copy',
              },
            },
          },
        ];
      }
      return [];
    });

    const options = await listLiveRubricsForAdminPicker(db as never);
    expect(options.find((row) => row.name === 'daily-pages-engagement')?.json).toContain(
      'Published copy'
    );
  });

  test('omits per-type rows when live columns are empty and there is no baseline revision', async () => {
    const actTypeId = 'cmpphw7w303lh01l15z0pr6nd';
    catalogList.mockResolvedValue({
      rubrics: [
        {
          key: `assignment-type:${actTypeId}`,
          source: 'assignment-type',
          name: `assignment-type:${actTypeId}`,
          title: 'ACT Writing Section',
          editable: false,
        },
      ],
    });
    assignmentType.findMany.mockImplementation(async (args: { where?: { id?: { in: string[] } } }) => {
      if (args?.where?.id?.in) {
        return [
          {
            id: actTypeId,
            title: 'ACT Writing Section',
            scoringScaleJson: { minScore: 1, maxScore: 6 },
            rubricJson: { categories: [] },
            gradingPromptConfigJson: {},
            gradingOutputSchemaJson: validLibrarySchema.outputSchema,
            gradingCalibrationNotes: null,
            rubricBaseline: null,
          },
        ];
      }
      return [{ id: actTypeId, title: 'ACT Writing Section' }];
    });

    const options = await listLiveRubricsForAdminPicker(db as never);
    expect(options.some((row) => row.catalogKey === `assignment-type:${actTypeId}`)).toBe(
      false
    );
  });
});

describe('resolveAdminRubricPickerSelection', () => {
  beforeEach(() => {
    rubric.findFirst.mockReset();
    assignmentType.findUnique.mockReset();
  });

  test('resolves built-in picker keys to the matching library rubric', async () => {
    rubric.findFirst.mockResolvedValue({
      id: 'lib-thesis',
      name: 'thesis-driven-essay',
      schemaJson: validLibrarySchema,
      currentRevision: null,
    });
    await expect(
      resolveAdminRubricPickerSelection('builtin:thesis-default', db as never)
    ).resolves.toEqual({
      kind: 'library',
      rubricId: 'lib-thesis',
      catalogKey: 'builtin:thesis-default',
    });
  });

  test('accepts library rubrics using published revision content', async () => {
    rubric.findFirst.mockResolvedValue({
      id: 'lib-1',
      name: 'daily-pages-engagement',
      schemaJson: { ...validLibrarySchema, rubric: { categories: [] } },
      currentRevision: { schemaJson: validLibrarySchema },
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
