import { describe, expect, test } from 'bun:test';
import { isDemoPlannerQaEnvironment } from '../seed-preview-planner-qa';

describe('ensureLessonPlannerEnabledForDemo', () => {
  test('isDemoPlannerQaEnvironment matches demo slug and database', () => {
    expect(isDemoPlannerQaEnvironment({ PREVIEW_SLUG: 'demo' })).toBe(true);
    expect(
      isDemoPlannerQaEnvironment({
        DATABASE_URL: 'postgresql://u:p@host/yawp_demo',
      })
    ).toBe(true);
    expect(isDemoPlannerQaEnvironment({ PREVIEW_SLUG: 'pr-374' })).toBe(false);
  });
});

describe('ensureInternalRubricsEnabledForDemo', () => {
  const fakePrisma = () => {
    const calls: unknown[] = [];
    return {
      calls,
      prisma: { setting: { upsert: async (args: unknown) => { calls.push(args); return {}; } } } as any,
    };
  };

  test('demo starts the flag at everyone without overwriting a later change', async () => {
    const { ensureInternalRubricsEnabledForDemo } = await import('./seed-lesson-planner-feature-flag');
    const { prisma, calls } = fakePrisma();
    expect(await ensureInternalRubricsEnabledForDemo(prisma, { PREVIEW_SLUG: 'demo' })).toEqual({ enabled: true });
    expect(calls).toEqual([{
      where: { name: 'feature_flag.internal_rubrics' },
      create: {
        name: 'feature_flag.internal_rubrics',
        value: '{"mode":"everyone","orgIds":[]}',
        valueType: 'json',
        description: 'Started on for everyone on demo.yawp.school',
      },
      update: {},
    }]);
  });

  test('anywhere else (production, previews, local) the flag is left off', async () => {
    const { ensureInternalRubricsEnabledForDemo } = await import('./seed-lesson-planner-feature-flag');
    const { prisma, calls } = fakePrisma();
    expect(await ensureInternalRubricsEnabledForDemo(prisma, { PREVIEW_SLUG: 'pr-430', DATABASE_URL: 'postgresql://u:p@host/yawp_production' })).toEqual({ skipped: true });
    expect(calls).toHaveLength(0);
  });
});

test('the preview/demo seed starts the internal_rubrics flag on demo', async () => {
  const source = await Bun.file(new URL('../seed-preview-seats.ts', import.meta.url)).text();
  expect(source).toContain('await ensureInternalRubricsEnabledForDemo(prisma)');
});

describe('ensureLessonPlannerEnabledForPreview', () => {
  const fakePrisma = () => {
    const calls: Array<{ where: { name: string }; create: { value: string }; update: Record<string, unknown> }> = [];
    return {
      calls,
      prisma: { setting: { upsert: async (args: any) => { calls.push(args); return {}; } } } as any,
    };
  };

  test('turns the planner and the review flags on in a PR preview database', async () => {
    const { ensureLessonPlannerEnabledForPreview } = await import('./seed-lesson-planner-feature-flag');
    const { prisma, calls } = fakePrisma();
    expect(await ensureLessonPlannerEnabledForPreview(prisma, 'yawp_pr_437')).toEqual({ enabled: true });
    expect(calls.map((call) => call.where.name)).toEqual([
      'feature_flag.lesson_planner',
      'feature_flag.lesson_planner_intake_v2',
      'feature_flag.lesson_planner_stack_v2',
      'feature_flag.lesson_planner_deck_v2',
      'feature_flag.lesson_planner_stack_panel',
      'feature_flag.lesson_planner_plan_export_v2',
      'feature_flag.lesson_planner_stack_v3',
      'feature_flag.lesson_planner_share',
      'feature_flag.lesson_planner_run_show',
      'feature_flag.lesson_planner_templates',
      'feature_flag.lesson_planner_deck_gallery',
    ]);
    for (const call of calls) expect(call.create.value).toBe('{"mode":"everyone","orgIds":[]}');
    // The planner is forced on, like free tier; the review flags are
    // create-only, so a tester can switch one off to compare.
    expect(calls[0].update).toMatchObject({ value: '{"mode":"everyone","orgIds":[]}' });
    for (const call of calls.slice(1)) expect(call.update).toEqual({});
  });

  test('never touches the demo, production, or any shared database', async () => {
    const { ensureLessonPlannerEnabledForPreview } = await import('./seed-lesson-planner-feature-flag');
    for (const name of ['yawp_demo', 'yawp_production', 'yawp', '', 'yawp_pr_437_extra']) {
      const { prisma, calls } = fakePrisma();
      expect(await ensureLessonPlannerEnabledForPreview(prisma, name)).toEqual({ skipped: true });
      expect(calls).toEqual([]);
    }
  });
});
