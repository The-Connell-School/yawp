import { describe, expect, test } from 'bun:test';
import { ensureLoungeCommunityEnabledForPreview } from './seed-lounge-community-feature-flag';

function fakePrisma() {
  const calls: unknown[] = [];
  return {
    calls,
    prisma: {
      setting: {
        upsert: async (args: unknown) => {
          calls.push(args);
          return {};
        },
      },
    } as any,
  };
}

describe('ensureLoungeCommunityEnabledForPreview', () => {
  test('a PR preview starts the community on for everyone, without overwriting a later change', async () => {
    const { prisma, calls } = fakePrisma();
    expect(await ensureLoungeCommunityEnabledForPreview(prisma, 'yawp_pr_484')).toEqual({ enabled: true });
    expect(calls).toEqual([
      {
        where: { name: 'feature_flag.teacher_lounge_community' },
        create: {
          name: 'feature_flag.teacher_lounge_community',
          value: '{"mode":"everyone","orgIds":[]}',
          valueType: 'json',
          description: "Started on for everyone in this PR preview",
        },
        update: {},
      },
    ]);
  });

  test('demo, production, and local databases are left alone', async () => {
    for (const name of ['yawp_demo', 'yawp_production', 'yawp_local', '']) {
      const { prisma, calls } = fakePrisma();
      expect(await ensureLoungeCommunityEnabledForPreview(prisma, name)).toEqual({ skipped: true });
      expect(calls).toHaveLength(0);
    }
  });
});

test('the preview seed calls it', async () => {
  const source = await Bun.file(new URL('../seed-preview-seats.ts', import.meta.url)).text();
  expect(source).toContain('ensureLoungeCommunityEnabledForPreview(prisma, databaseName)');
});
