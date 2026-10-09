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
