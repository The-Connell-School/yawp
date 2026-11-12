import { describe, expect, test } from 'bun:test';

describe('ensureGuidedToursEnabledForPreview', () => {
  const fakePrisma = () => {
    const calls: unknown[] = [];
    return {
      calls,
      prisma: { setting: { upsert: async (args: unknown) => { calls.push(args); return {}; } } } as any,
    };
  };

  test('starts page tours on for everyone in a PR preview database', async () => {
    const { ensureGuidedToursEnabledForPreview } = await import('./seed-guided-tours-feature-flag');
    const { prisma, calls } = fakePrisma();
    expect(await ensureGuidedToursEnabledForPreview(prisma, 'yawp_pr_936')).toEqual({ enabled: true });
    // Everyone, not targeted: each new free teacher gets a new organization.
    // Create-only, so a tester who switches tours off is not overridden by a redeploy.
    expect(calls).toEqual([{
      where: { name: 'feature_flag.guided-tours' },
      create: {
        name: 'feature_flag.guided-tours',
        value: '{"mode":"everyone","orgIds":[]}',
        valueType: 'json',
        description: 'Started on for PR preview',
      },
      update: {},
    }]);
  });

  test('never touches the demo, production, or any shared database', async () => {
    const { ensureGuidedToursEnabledForPreview } = await import('./seed-guided-tours-feature-flag');
    for (const name of ['yawp_demo', 'yawp_production', 'yawp', '', 'yawp_pr_936_extra']) {
      const { prisma, calls } = fakePrisma();
      expect(await ensureGuidedToursEnabledForPreview(prisma, name)).toEqual({ skipped: true });
      expect(calls).toEqual([]);
    }
  });
});

test('the preview seed starts page tours on PR previews', async () => {
  const source = await Bun.file(new URL('../seed-preview-seats.ts', import.meta.url)).text();
  expect(source).toContain('await ensureGuidedToursEnabledForPreview(prisma, databaseName)');
});
