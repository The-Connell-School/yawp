import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const handleReporterToolCall = mock();
const listLoungeMaterials = mock();
const listAssignableTypes = mock();
const readLoungeMaterial = mock();

mock.module('~/domain/reporter/reporter-tools.server', () => ({
  handleReporterToolCall,
  REPORTER_TOOLS: [
    { name: 'list_classes', description: 'a', input_schema: {} },
    { name: 'get_class_grade_report', description: 'b', input_schema: {} },
    {
      name: 'find_students_needing_attention',
      description: 'c',
      input_schema: {},
    },
    { name: 'get_submission_detail', description: 'd', input_schema: {} },
    { name: 'save_growth_plan', description: 'e', input_schema: {} },
  ],
}));
mock.module('~/domain/lesson-planner/yawp-catalog.server', () => ({
  listLoungeMaterials,
  listAssignableTypes,
  readLoungeMaterial,
}));

const {
  LESSON_PLANNER_TOOLS,
  LESSON_PLANNER_TOOL_NAMES,
  LESSON_PLANNER_CATALOG_TOOLS,
  handleLessonPlannerToolCall,
} = await import('./lesson-planner-tools.server');

afterAll(() => {
  mock.restore();
});

const ctx = { membershipId: 'member-1', organizationId: 'org-1' };

beforeEach(() => {
  handleReporterToolCall.mockReset().mockResolvedValue('{"ok":true}');
  listLoungeMaterials.mockReset().mockResolvedValue([]);
  listAssignableTypes.mockReset().mockResolvedValue([]);
  readLoungeMaterial.mockReset().mockResolvedValue({ error: 'not stubbed' });
});

/** One course, one module, one deck — enough to exercise the listing's note. */
function loungeWith(materials: Array<{ readable: boolean }>) {
  return [
    {
      title: 'Argument Writing',
      description: null,
      href: '/app/teacher-trainings/t1',
      modules: [
        {
          title: 'Body Paragraphs',
          description: null,
          href: '/app/teacher-trainings/t1/modules/m1',
          materials: materials.map((material, index) => ({
            id: `res-${index}`,
            name: `Deck ${index}.pptx`,
            kind: 'slides',
            href: `/api/teacher-training-module-resource/res-${index}`,
            readable: material.readable,
          })),
        },
      ],
      links: [],
    },
  ];
}

describe('LESSON_PLANNER_TOOLS', () => {
  test('exposes the class-context tools and the Yawp catalog', () => {
    expect(LESSON_PLANNER_TOOLS.map((tool) => tool.name)).toEqual([
      ...LESSON_PLANNER_TOOL_NAMES,
    ]);
    for (const name of [
      'list_classes',
      'search_daily_pages_prompts',
      'list_writing_lessons',
      'get_writing_lesson',
      'list_lounge_materials',
      'list_assignment_types',
    ]) {
      expect(LESSON_PLANNER_TOOL_NAMES).toContain(name);
    }
  });

  test('never exposes a tool that writes', () => {
    expect(LESSON_PLANNER_TOOL_NAMES).not.toContain('save_growth_plan');
    for (const tool of LESSON_PLANNER_TOOLS) {
      expect(tool.name.startsWith('save_')).toBe(false);
    }
  });

  test('carries the reporter definitions through verbatim', () => {
    const listClasses = LESSON_PLANNER_TOOLS.find(
      (tool) => tool.name === 'list_classes'
    );
    expect(listClasses).toMatchObject({ description: 'a' });
  });

  test('gives every catalog tool a schema the API will accept', () => {
    for (const tool of LESSON_PLANNER_CATALOG_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.input_schema).toMatchObject({ type: 'object' });
    }
  });
});

describe('handleLessonPlannerToolCall', () => {
  test('delegates an allowed reporter tool to the reporter handler', async () => {
    const result = await handleLessonPlannerToolCall(
      'list_classes',
      {},
      { ...ctx }
    );

    expect(result).toBe('{"ok":true}');
    expect(handleReporterToolCall).toHaveBeenCalledWith(
      'list_classes',
      {},
      { membershipId: 'member-1', organizationId: 'org-1' }
    );
  });

  test('refuses a reporter tool outside the allowlist without calling through', async () => {
    const result = await handleLessonPlannerToolCall(
      'save_growth_plan',
      { student: 'x' },
      { ...ctx }
    );

    expect(JSON.parse(result)).toMatchObject({ error: expect.any(String) });
    expect(handleReporterToolCall).not.toHaveBeenCalled();
  });

  test('refuses an unknown tool name', async () => {
    const result = await handleLessonPlannerToolCall(
      'drop_tables',
      {},
      { ...ctx }
    );

    expect(JSON.parse(result).error).toContain('drop_tables');
    expect(handleReporterToolCall).not.toHaveBeenCalled();
  });

  test('never forwards a growth-plan write buffer to the reporter layer', async () => {
    await handleLessonPlannerToolCall(
      'get_class_grade_report',
      { classId: 'c' },
      { ...ctx }
    );

    const forwarded = handleReporterToolCall.mock.calls[0]![2] as Record<
      string,
      unknown
    >;
    expect(forwarded).not.toHaveProperty('pendingGrowthPlanSaves');
  });

  test('serves Daily Pages prompts without going through the reporter', async () => {
    const result = JSON.parse(
      await handleLessonPlannerToolCall(
        'search_daily_pages_prompts',
        { gradeBand: '10', limit: 2 },
        { ...ctx }
      )
    );

    expect(result.prompts).toHaveLength(2);
    expect(result.prompts[0].id).toBeTruthy();
    expect(handleReporterToolCall).not.toHaveBeenCalled();
  });

  test('tells the model to loosen its filters instead of inventing a prompt', async () => {
    const result = JSON.parse(
      await handleLessonPlannerToolCall(
        'search_daily_pages_prompts',
        { text: 'a-book-yawp-does-not-have' },
        { ...ctx }
      )
    );

    expect(result.prompts).toEqual([]);
    expect(result.note).toMatch(/loosen/i);
  });

  test('returns a writing lesson with its full text and link', async () => {
    const listed = JSON.parse(
      await handleLessonPlannerToolCall('list_writing_lessons', {}, { ...ctx })
    );
    const slug = listed.lessons[0].slug;

    const lesson = JSON.parse(
      await handleLessonPlannerToolCall(
        'get_writing_lesson',
        { slug },
        { ...ctx }
      )
    );
    expect(lesson.href).toBe(`/app/writing-lessons/${slug}`);
    expect(lesson.content.length).toBeGreaterThan(0);
  });

  test('reports an unknown lesson slug rather than improvising one', async () => {
    const lesson = JSON.parse(
      await handleLessonPlannerToolCall(
        'get_writing_lesson',
        { slug: 'not-a-lesson' },
        { ...ctx }
      )
    );
    expect(lesson.error).toContain('not-a-lesson');
  });

  test('passes the teacher scope to the lounge and assignment lookups', async () => {
    await handleLessonPlannerToolCall('list_lounge_materials', {}, { ...ctx });
    await handleLessonPlannerToolCall('list_assignment_types', {}, { ...ctx });

    expect(listLoungeMaterials).toHaveBeenCalledWith(ctx);
    expect(listAssignableTypes).toHaveBeenCalledWith(ctx);
  });

  test('degrades to a plannable error when a catalog lookup throws', async () => {
    listLoungeMaterials.mockRejectedValue(new Error('db down'));

    const result = JSON.parse(
      await handleLessonPlannerToolCall('list_lounge_materials', {}, { ...ctx })
    );

    expect(result.error).toMatch(/plan without it/i);
    expect(result.error).not.toContain('db down');
  });
});

describe('read_lounge_material', () => {
  test('is offered alongside the listing', () => {
    expect(LESSON_PLANNER_TOOL_NAMES).toContain('read_lounge_material');
    const tool = LESSON_PLANNER_CATALOG_TOOLS.find(
      (candidate) => candidate.name === 'read_lounge_material'
    )!;
    expect(tool.input_schema.required).toEqual(['id']);
    // The description has to say what the listing does NOT give you, or the
    // model keeps describing decks it has only seen the filename of.
    expect(tool.description).toMatch(/before/i);
  });

  test('opens the file the model asked for, under the teacher scope', async () => {
    readLoungeMaterial.mockResolvedValue({
      kind: 'slides',
      name: 'Body Paragraphs.pptx',
      href: '/api/teacher-training-module-resource/res-0',
      slides: [{ number: 1, lines: ['Claim first'], notes: '' }],
      truncated: false,
    });

    const result = JSON.parse(
      await handleLessonPlannerToolCall(
        'read_lounge_material',
        { id: 'res-0' },
        { ...ctx }
      )
    );

    expect(readLoungeMaterial).toHaveBeenCalledWith(ctx, 'res-0');
    expect(result.slides[0].lines).toEqual(['Claim first']);
  });

  test('tells the model to go read the files it can open', async () => {
    listLoungeMaterials.mockResolvedValue(loungeWith([{ readable: true }]));

    const result = JSON.parse(
      await handleLessonPlannerToolCall('list_lounge_materials', {}, { ...ctx })
    );

    expect(result.note).toMatch(/read_lounge_material/);
    expect(result.note).toMatch(/filename tells you nothing/i);
  });

  test('tells it to stay quiet about files it cannot open', async () => {
    listLoungeMaterials.mockResolvedValue(loungeWith([{ readable: false }]));

    const result = JSON.parse(
      await handleLessonPlannerToolCall('list_lounge_materials', {}, { ...ctx })
    );

    expect(result.note).toMatch(/say nothing about what is inside/i);
  });
});
