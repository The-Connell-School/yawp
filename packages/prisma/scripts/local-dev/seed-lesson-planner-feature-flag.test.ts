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

  test('is a no-op after internal_rubrics flag removal', async () => {
    const { ensureInternalRubricsEnabledForDemo } = await import('./seed-lesson-planner-feature-flag');
    const { prisma, calls } = fakePrisma();
    expect(await ensureInternalRubricsEnabledForDemo(prisma, { PREVIEW_SLUG: 'demo' })).toEqual({ skipped: true });
    expect(calls).toHaveLength(0);
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

  test('turns the master planner flag on in a PR preview database', async () => {
    const { ensureLessonPlannerEnabledForPreview } = await import('./seed-lesson-planner-feature-flag');
    const { prisma, calls } = fakePrisma();
    expect(await ensureLessonPlannerEnabledForPreview(prisma, 'yawp_pr_437')).toEqual({ enabled: true });
    expect(calls.map((call) => call.where.name)).toEqual(['feature_flag.lesson_planner']);
    expect(calls[0].create.value).toBe('{"mode":"everyone","orgIds":[]}');
    expect(calls[0].update).toMatchObject({ value: '{"mode":"everyone","orgIds":[]}' });
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
