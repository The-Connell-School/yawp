import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  savedApEnglishLangPrompt: {
    upsert: mock(),
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  hashPromptText,
  listSavedApEnglishLangPrompts,
  MAX_SAVED_PROMPT_LENGTH,
  sanitizeFacets,
  saveApEnglishLangPrompt,
  SavedPromptError,
} = await import('./saved-prompts.server');

const savedRow = {
  id: 'saved-1',
  title: 'The Cost of Convenience',
  prompt: 'Take a position on what convenience costs a community.',
  facets: {
    frqType: 'argument',
    focusSkill: 'line-of-reasoning',
    difficulty: 'developing',
  },
  createdAt: new Date('2026-07-28T12:00:00.000Z'),
};

describe('hashPromptText', () => {
  test('ignores surrounding whitespace so a re-save matches', () => {
    expect(hashPromptText('  Write about risk.  ')).toBe(
      hashPromptText('Write about risk.')
    );
  });

  test('distinguishes different prompts', () => {
    expect(hashPromptText('One prompt')).not.toBe(hashPromptText('Another'));
  });
});

describe('sanitizeFacets', () => {
  test('keeps values from the library vocabulary', () => {
    expect(
      sanitizeFacets({
        frqType: 'argument',
        focusSkill: 'counterargument',
        difficulty: 'exam-ready',
      })
    ).toEqual({
      frqType: 'argument',
      focusSkill: 'counterargument',
      difficulty: 'exam-ready',
    });
  });

  test('drops values outside the vocabulary rather than the whole prompt', () => {
    expect(
      sanitizeFacets({
        frqType: 'sonnet',
        difficulty: 'impossible',
        focusSkill: 'counterargument',
      })
    ).toEqual({ focusSkill: 'counterargument' });
  });

  test('trims a free-form focus skill and rejects an empty one', () => {
    expect(sanitizeFacets({ focusSkill: '  tone-and-restraint  ' })).toEqual({
      focusSkill: 'tone-and-restraint',
    });
    expect(sanitizeFacets({ focusSkill: '   ' })).toEqual({});
  });

  test('returns an empty object for non-objects', () => {
    expect(sanitizeFacets(null)).toEqual({});
    expect(sanitizeFacets('argument')).toEqual({});
    expect(sanitizeFacets(['argument'])).toEqual({});
  });
});

describe('saveApEnglishLangPrompt', () => {
  beforeEach(() => {
    prisma.savedApEnglishLangPrompt.upsert.mockReset();
    prisma.savedApEnglishLangPrompt.findMany.mockReset();
    prisma.savedApEnglishLangPrompt.upsert.mockResolvedValue(savedRow);
  });

  test('upserts on the prompt hash so saving then using leaves one row', async () => {
    await saveApEnglishLangPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'The Cost of Convenience',
      prompt: '  Take a position on what convenience costs a community.  ',
      facets: { frqType: 'argument' },
    });

    const args = prisma.savedApEnglishLangPrompt.upsert.mock.calls[0][0];
    expect(args.where.membershipId_assignmentTypeId_promptHash).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      promptHash: hashPromptText(
        'Take a position on what convenience costs a community.'
      ),
    });
    // Stored trimmed, so the hash and the text always agree.
    expect(args.create.prompt).toBe(
      'Take a position on what convenience costs a community.'
    );
    expect(args.update.archivedAt).toBeNull();
  });

  test('returns the saved prompt with sanitized facets', async () => {
    const saved = await saveApEnglishLangPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'The Cost of Convenience',
      prompt: 'Take a position on what convenience costs a community.',
      facets: {},
    });

    expect(saved).toEqual({
      id: 'saved-1',
      title: 'The Cost of Convenience',
      prompt: 'Take a position on what convenience costs a community.',
      savedAt: '2026-07-28T12:00:00.000Z',
      facets: {
        frqType: 'argument',
        focusSkill: 'line-of-reasoning',
        difficulty: 'developing',
      },
    });
  });

  test('falls back to a title when the generator did not give one', async () => {
    await saveApEnglishLangPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: '   ',
      prompt: 'Take a position on what convenience costs a community.',
      facets: {},
    });

    const args = prisma.savedApEnglishLangPrompt.upsert.mock.calls[0][0];
    expect(args.create.title.length).toBeGreaterThan(0);
  });

  test('rejects an empty prompt', async () => {
    await expect(
      saveApEnglishLangPrompt({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        title: 'Untitled',
        prompt: '   ',
        facets: {},
      })
    ).rejects.toBeInstanceOf(SavedPromptError);
    expect(prisma.savedApEnglishLangPrompt.upsert).not.toHaveBeenCalled();
  });

  test('rejects a prompt beyond the length bound', async () => {
    await expect(
      saveApEnglishLangPrompt({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        title: 'Long',
        prompt: 'x'.repeat(MAX_SAVED_PROMPT_LENGTH + 1),
        facets: {},
      })
    ).rejects.toBeInstanceOf(SavedPromptError);
  });
});

describe('listSavedApEnglishLangPrompts', () => {
  beforeEach(() => {
    prisma.savedApEnglishLangPrompt.findMany.mockReset();
    prisma.savedApEnglishLangPrompt.findMany.mockResolvedValue([savedRow]);
  });

  test('returns the teacher\'s un-archived prompts, newest first', async () => {
    const prompts = await listSavedApEnglishLangPrompts({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
    });

    const args = prisma.savedApEnglishLangPrompt.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      archivedAt: null,
    });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(prompts[0].id).toBe('saved-1');
  });

  test('sanitizes facets stored before a vocabulary change', async () => {
    prisma.savedApEnglishLangPrompt.findMany.mockResolvedValue([
      { ...savedRow, facets: { frqType: 'retired-type', difficulty: 'entry' } },
    ]);

    const prompts = await listSavedApEnglishLangPrompts({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
    });

    expect(prompts[0].facets).toEqual({ difficulty: 'entry' });
  });
});
