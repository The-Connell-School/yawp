import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  savedDailyPagesPrompt: {
    upsert: mock(),
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  hashPromptText,
  listSavedDailyPagesPrompts,
  MAX_SAVED_PROMPT_LENGTH,
  SavedPromptError,
  saveDailyPagesPrompt,
} = await import('./saved-prompts.server');

const PROMPT = 'You become who you spend time with. Defend or reject this.';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'saved-1',
  prompt: PROMPT,
  facets: {
    type: 'agree-disagree',
    seriousness: 'moderate',
    cognitiveMoves: ['take-a-stance'],
  },
  createdAt: new Date('2026-07-28T12:00:00.000Z'),
  ...overrides,
});

describe('saveDailyPagesPrompt', () => {
  beforeEach(() => {
    prisma.savedDailyPagesPrompt.upsert.mockReset();
    prisma.savedDailyPagesPrompt.findMany.mockReset();
    prisma.savedDailyPagesPrompt.upsert.mockResolvedValue(row());
  });

  test('saves a prompt for the teacher and assignment type', async () => {
    const saved = await saveDailyPagesPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      prompt: PROMPT,
      facets: {
        type: 'agree-disagree',
        seriousness: 'moderate',
        cognitiveMoves: ['take-a-stance'],
      },
    });

    expect(saved).toEqual({
      id: 'saved-1',
      prompt: PROMPT,
      savedAt: '2026-07-28T12:00:00.000Z',
      facets: {
        type: 'agree-disagree',
        seriousness: 'moderate',
        cognitiveMoves: ['take-a-stance'],
      },
    });

    const args = prisma.savedDailyPagesPrompt.upsert.mock.calls[0][0];
    expect(args.where.membershipId_assignmentTypeId_promptHash).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      promptHash: hashPromptText(PROMPT),
    });
    expect(args.create.membershipId).toBe('teacher-1');
    expect(args.create.assignmentTypeId).toBe('at-1');
    expect(args.create.source).toBe('generator');
  });

  test('saving the same prompt twice updates instead of duplicating', async () => {
    // The unique (membership, assignment type, prompt hash) key makes the write
    // idempotent, so "save" then "use" leaves a single row.
    await saveDailyPagesPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      prompt: PROMPT,
      facets: {},
    });
    await saveDailyPagesPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      prompt: `  ${PROMPT}  `,
      facets: {},
    });

    const [first, second] = prisma.savedDailyPagesPrompt.upsert.mock.calls;
    expect(
      second[0].where.membershipId_assignmentTypeId_promptHash.promptHash
    ).toBe(first[0].where.membershipId_assignmentTypeId_promptHash.promptHash);
    // Re-saving restores a prompt the teacher had previously removed.
    expect(second[0].update.archivedAt).toBeNull();
  });

  test('drops facet tags outside the library vocabulary', async () => {
    await saveDailyPagesPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      prompt: PROMPT,
      facets: {
        type: 'musing',
        seriousness: 'very-serious',
        cognitiveMoves: ['ponder', 'compare'],
      } as never,
    });

    const args = prisma.savedDailyPagesPrompt.upsert.mock.calls[0][0];
    expect(args.create.facets).toEqual({ cognitiveMoves: ['compare'] });
  });

  test('rejects an empty or implausibly long prompt', async () => {
    await expect(
      saveDailyPagesPrompt({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        prompt: '   ',
        facets: {},
      })
    ).rejects.toBeInstanceOf(SavedPromptError);

    await expect(
      saveDailyPagesPrompt({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        prompt: 'x'.repeat(MAX_SAVED_PROMPT_LENGTH + 1),
        facets: {},
      })
    ).rejects.toBeInstanceOf(SavedPromptError);

    expect(prisma.savedDailyPagesPrompt.upsert).not.toHaveBeenCalled();
  });
});

describe('listSavedDailyPagesPrompts', () => {
  beforeEach(() => {
    prisma.savedDailyPagesPrompt.findMany.mockReset();
  });

  test('lists the teacher\'s un-archived prompts, newest first', async () => {
    prisma.savedDailyPagesPrompt.findMany.mockResolvedValue([row()]);

    const saved = await listSavedDailyPagesPrompts({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
    });

    expect(saved).toEqual([
      {
        id: 'saved-1',
        prompt: PROMPT,
        savedAt: '2026-07-28T12:00:00.000Z',
        facets: {
          type: 'agree-disagree',
          seriousness: 'moderate',
          cognitiveMoves: ['take-a-stance'],
        },
      },
    ]);

    const args = prisma.savedDailyPagesPrompt.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      archivedAt: null,
    });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  test('tolerates rows whose stored facets are missing or malformed', async () => {
    prisma.savedDailyPagesPrompt.findMany.mockResolvedValue([
      row({ id: 'a', facets: null }),
      row({ id: 'b', facets: 'not an object' }),
      row({ id: 'c', facets: { type: 'nonsense', seriousness: 'playful' } }),
    ]);

    const saved = await listSavedDailyPagesPrompts({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
    });

    expect(saved.map((entry) => entry.facets)).toEqual([
      {},
      {},
      { seriousness: 'playful' },
    ]);
  });
});
