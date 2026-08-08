import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  savedThesisPrompt: {
    upsert: mock(),
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  hashPromptBody,
  listSavedThesisPrompts,
  MAX_SAVED_PROMPT_BODY_LENGTH,
  MAX_SAVED_PROMPT_TITLE_LENGTH,
  SavedPromptError,
  saveThesisPrompt,
} = await import('./saved-prompts.server');

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'saved-1',
  title: 'Loyalty Under Pressure',
  prompt: 'Write a thesis-driven critical essay on loyalty under pressure.',
  createdAt: new Date('2026-07-27T12:00:00.000Z'),
  ...overrides,
});

describe('saveThesisPrompt', () => {
  beforeEach(() => {
    prisma.savedThesisPrompt.upsert.mockReset();
    prisma.savedThesisPrompt.findMany.mockReset();
    prisma.savedThesisPrompt.upsert.mockResolvedValue(row());
  });

  test('saves a prompt for the teacher and assignment type', async () => {
    const saved = await saveThesisPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'Loyalty Under Pressure',
      prompt: 'Write a thesis-driven critical essay on loyalty under pressure.',
    });

    expect(saved).toEqual({
      id: 'saved-1',
      title: 'Loyalty Under Pressure',
      prompt: 'Write a thesis-driven critical essay on loyalty under pressure.',
      savedAt: '2026-07-27T12:00:00.000Z',
    });

    const args = prisma.savedThesisPrompt.upsert.mock.calls[0][0];
    expect(args.where.membershipId_assignmentTypeId_promptHash).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      promptHash: hashPromptBody(
        'Write a thesis-driven critical essay on loyalty under pressure.'
      ),
    });
    expect(args.create.membershipId).toBe('teacher-1');
    expect(args.create.assignmentTypeId).toBe('at-1');
    expect(args.create.source).toBe('generator');
  });

  test('saving the same prompt twice updates instead of duplicating', async () => {
    // The unique (membership, assignment type, prompt hash) key makes the write
    // idempotent, so "save" then "use" leaves a single row.
    await saveThesisPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'Loyalty Under Pressure',
      prompt: 'Write a thesis-driven critical essay on loyalty under pressure.',
    });
    const args = prisma.savedThesisPrompt.upsert.mock.calls[0][0];
    expect(args.update.title).toBe('Loyalty Under Pressure');
    expect(args.update.archivedAt).toBeNull();
  });

  test('ignores surrounding whitespace when hashing so near-copies collapse', () => {
    expect(hashPromptBody('  Write an essay.\n')).toBe(
      hashPromptBody('Write an essay.')
    );
    expect(hashPromptBody('Write an essay.')).not.toBe(
      hashPromptBody('Write another essay.')
    );
  });

  test('falls back to a generic title when the model gives none', async () => {
    await saveThesisPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: '   ',
      prompt: 'Write a thesis-driven critical essay on loyalty.',
    });
    const args = prisma.savedThesisPrompt.upsert.mock.calls[0][0];
    expect(args.create.title).toBe('Untitled prompt');
  });

  test('truncates an over-long title rather than rejecting the save', async () => {
    await saveThesisPrompt({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'T'.repeat(MAX_SAVED_PROMPT_TITLE_LENGTH + 50),
      prompt: 'Write a thesis-driven critical essay on loyalty.',
    });
    const args = prisma.savedThesisPrompt.upsert.mock.calls[0][0];
    expect(args.create.title.length).toBe(MAX_SAVED_PROMPT_TITLE_LENGTH);
  });

  test('rejects an empty prompt body', async () => {
    await expect(
      saveThesisPrompt({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        title: 'Whatever',
        prompt: '   ',
      })
    ).rejects.toBeInstanceOf(SavedPromptError);
    expect(prisma.savedThesisPrompt.upsert).not.toHaveBeenCalled();
  });

  test('rejects a prompt body that is too long to be a real prompt', async () => {
    await expect(
      saveThesisPrompt({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        title: 'Whatever',
        prompt: 'x'.repeat(MAX_SAVED_PROMPT_BODY_LENGTH + 1),
      })
    ).rejects.toBeInstanceOf(SavedPromptError);
    expect(prisma.savedThesisPrompt.upsert).not.toHaveBeenCalled();
  });
});

describe('listSavedThesisPrompts', () => {
  beforeEach(() => {
    prisma.savedThesisPrompt.findMany.mockReset();
    prisma.savedThesisPrompt.findMany.mockResolvedValue([
      row(),
      row({ id: 'saved-2', title: 'The Cost of Silence' }),
    ]);
  });

  test('scopes the query to this teacher and assignment type, newest first', async () => {
    const saved = await listSavedThesisPrompts({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
    });

    const args = prisma.savedThesisPrompt.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      archivedAt: null,
    });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(saved.map((entry) => entry.id)).toEqual(['saved-1', 'saved-2']);
    expect(saved[0].savedAt).toBe('2026-07-27T12:00:00.000Z');
  });
});
