import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const handleReporterToolCall = mock();
const listLoungeMaterials = mock();
const listAssignableTypes = mock();

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
});

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
