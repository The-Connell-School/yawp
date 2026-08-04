import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const handleReporterToolCall = mock();

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

const {
  LESSON_PLANNER_TOOLS,
  LESSON_PLANNER_TOOL_NAMES,
  handleLessonPlannerToolCall,
} = await import('./lesson-planner-tools.server');

afterAll(() => {
  mock.restore();
});

const ctx = { membershipId: 'member-1', organizationId: 'org-1' };

beforeEach(() => {
  handleReporterToolCall.mockReset().mockResolvedValue('{"ok":true}');
});

describe('LESSON_PLANNER_TOOLS', () => {
  test('exposes only the read-only class-context tools', () => {
    expect(LESSON_PLANNER_TOOLS.map((tool) => tool.name)).toEqual([
      ...LESSON_PLANNER_TOOL_NAMES,
    ]);
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
});

describe('handleLessonPlannerToolCall', () => {
  test('delegates an allowed tool to the reporter handler', async () => {
    const result = await handleLessonPlannerToolCall(
      'list_classes',
      {},
      { ...ctx }
    );

    expect(result).toBe('{"ok":true}');
    expect(handleReporterToolCall).toHaveBeenCalledWith(
      'list_classes',
      {},
      {
        membershipId: 'member-1',
        organizationId: 'org-1',
      }
    );
  });

  test('refuses a tool outside the allowlist without calling through', async () => {
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
      {
        ...ctx,
      }
    );

    expect(JSON.parse(result).error).toContain('drop_tables');
    expect(handleReporterToolCall).not.toHaveBeenCalled();
  });

  test('never forwards a growth-plan write buffer to the reporter layer', async () => {
    await handleLessonPlannerToolCall(
      'get_class_grade_report',
      { classId: 'c' },
      {
        ...ctx,
      }
    );

    const forwarded = handleReporterToolCall.mock.calls[0]![2] as Record<
      string,
      unknown
    >;
    expect(forwarded).not.toHaveProperty('pendingGrowthPlanSaves');
  });
});
