import { describe, expect, test } from 'bun:test';

const fakePrisma = () => {
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
};

describe('ensureThesisEssayDecksEnabledForPreview', () => {
  test('a PR preview starts the decks flag on, without overwriting a later change', async () => {
    const { ensureThesisEssayDecksEnabledForPreview } = await import(
      './seed-thesis-essay-decks-feature-flag'
    );
    const { prisma, calls } = fakePrisma();
    expect(await ensureThesisEssayDecksEnabledForPreview(prisma, 'yawp_pr_452')).toEqual({
      enabled: true,
    });
    expect(calls).toEqual([
      {
        where: { name: 'feature_flag.thesis_essay_decks' },
        create: {
          name: 'feature_flag.thesis_essay_decks',
          value: 'true',
          valueType: 'boolean',
          description: 'Started on for PR preview QA',
        },
        update: {},
      },
    ]);
  });

  test('demo, production and local databases are left alone', async () => {
    const { ensureThesisEssayDecksEnabledForPreview } = await import(
      './seed-thesis-essay-decks-feature-flag'
    );
    for (const database of ['yawp_demo', 'yawp_production', 'yawp_dev', '']) {
      const { prisma, calls } = fakePrisma();
      expect(await ensureThesisEssayDecksEnabledForPreview(prisma, database)).toEqual({
        skipped: true,
      });
      expect(calls).toHaveLength(0);
    }
  });
});

test('the preview seed starts the decks flag', async () => {
  const source = await Bun.file(new URL('../seed-preview-seats.ts', import.meta.url)).text();
  expect(source).toContain('await ensureThesisEssayDecksEnabledForPreview(prisma, databaseName)');
});
