import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  savedAssignment: {
    upsert: mock(),
    findMany: mock(),
    updateMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  archiveSavedAssignment,
  hashSavedAssignmentPrompt,
  listSavedAssignments,
  MAX_SAVED_ASSIGNMENT_PROMPT_LENGTH,
  MAX_SAVED_ASSIGNMENT_TITLE_LENGTH,
  SavedAssignmentError,
  saveAssignmentForReuse,
} = await import('./saved-assignments.server');

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'saved-1',
  title: 'Rhetorical Analysis Essay',
  prompt: 'Analyze the rhetorical choices in the passage.',
  submitForGrade: true,
  pointValue: 100,
  gradingAssistantStrictnessLevel: 'intermediate',
  tutorEnabled: true,
  createdAt: new Date('2026-08-08T12:00:00.000Z'),
  assignmentType: { id: 'at-1', title: 'Essay' },
  ...overrides,
});

describe('saveAssignmentForReuse', () => {
  beforeEach(() => {
    prisma.savedAssignment.upsert.mockReset();
    prisma.savedAssignment.upsert.mockResolvedValue(row());
  });

  test('saves the whole assignment configuration for the teacher', async () => {
    const saved = await saveAssignmentForReuse({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'Rhetorical Analysis Essay',
      prompt: 'Analyze the rhetorical choices in the passage.',
      submitForGrade: true,
      pointValue: 100,
      gradingAssistantStrictnessLevel: 'intermediate',
      tutorEnabled: true,
    });

    expect(saved).toEqual({
      id: 'saved-1',
      title: 'Rhetorical Analysis Essay',
      prompt: 'Analyze the rhetorical choices in the passage.',
      submitForGrade: true,
      pointValue: 100,
      gradingAssistantStrictnessLevel: 'intermediate',
      tutorEnabled: true,
      assignmentTypeId: 'at-1',
      assignmentTypeTitle: 'Essay',
      savedAt: '2026-08-08T12:00:00.000Z',
    });

    const args = prisma.savedAssignment.upsert.mock.calls[0][0];
    expect(args.where.membershipId_assignmentTypeId_promptHash).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      promptHash: hashSavedAssignmentPrompt(
        'Analyze the rhetorical choices in the passage.'
      ),
    });
    expect(args.create.membershipId).toBe('teacher-1');
    expect(args.create.assignmentTypeId).toBe('at-1');
    expect(args.create.submitForGrade).toBe(true);
    expect(args.create.pointValue).toBe(100);
    expect(args.create.tutorEnabled).toBe(true);
    expect(args.create.source).toBe('creation-sheet');
  });

  test('saving the same assignment twice updates instead of duplicating', async () => {
    // The unique (membership, assignment type, prompt hash) key makes the write
    // idempotent, so re-creating the same assignment leaves a single row.
    await saveAssignmentForReuse({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'Rhetorical Analysis Essay',
      prompt: 'Analyze the rhetorical choices in the passage.',
      submitForGrade: false,
      pointValue: null,
      gradingAssistantStrictnessLevel: 'advanced',
      tutorEnabled: false,
    });

    const args = prisma.savedAssignment.upsert.mock.calls[0][0];
    expect(args.update).toEqual({
      title: 'Rhetorical Analysis Essay',
      submitForGrade: false,
      pointValue: null,
      gradingAssistantStrictnessLevel: 'advanced',
      tutorEnabled: false,
      archivedAt: null,
    });
  });

  test('ignores surrounding whitespace when hashing so near-copies collapse', () => {
    expect(hashSavedAssignmentPrompt('  Write an essay.\n')).toBe(
      hashSavedAssignmentPrompt('Write an essay.')
    );
    expect(hashSavedAssignmentPrompt('Write an essay.')).not.toBe(
      hashSavedAssignmentPrompt('Write another essay.')
    );
  });

  test('falls back to a generic title when the teacher left it blank', async () => {
    await saveAssignmentForReuse({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: '   ',
      prompt: 'Analyze the rhetorical choices in the passage.',
      submitForGrade: true,
      pointValue: 100,
      gradingAssistantStrictnessLevel: 'intermediate',
      tutorEnabled: true,
    });

    const args = prisma.savedAssignment.upsert.mock.calls[0][0];
    expect(args.create.title).toBe('Untitled assignment');
  });

  test('truncates an over-long title rather than rejecting the save', async () => {
    await saveAssignmentForReuse({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'T'.repeat(MAX_SAVED_ASSIGNMENT_TITLE_LENGTH + 50),
      prompt: 'Analyze the rhetorical choices in the passage.',
      submitForGrade: true,
      pointValue: 100,
      gradingAssistantStrictnessLevel: 'intermediate',
      tutorEnabled: true,
    });

    const args = prisma.savedAssignment.upsert.mock.calls[0][0];
    expect(args.create.title.length).toBe(MAX_SAVED_ASSIGNMENT_TITLE_LENGTH);
  });

  test('drops the point value when the assignment is not submitted for a grade', async () => {
    await saveAssignmentForReuse({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'Practice draft',
      prompt: 'Analyze the rhetorical choices in the passage.',
      submitForGrade: false,
      pointValue: 100,
      gradingAssistantStrictnessLevel: 'intermediate',
      tutorEnabled: true,
    });

    const args = prisma.savedAssignment.upsert.mock.calls[0][0];
    expect(args.create.pointValue).toBeNull();
  });

  test('rejects an empty prompt body', async () => {
    await expect(
      saveAssignmentForReuse({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        title: 'Whatever',
        prompt: '   ',
        submitForGrade: true,
        pointValue: 100,
        gradingAssistantStrictnessLevel: 'intermediate',
        tutorEnabled: true,
      })
    ).rejects.toBeInstanceOf(SavedAssignmentError);
    expect(prisma.savedAssignment.upsert).not.toHaveBeenCalled();
  });

  test('rejects a prompt body too long to be a real assignment', async () => {
    await expect(
      saveAssignmentForReuse({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        title: 'Whatever',
        prompt: 'x'.repeat(MAX_SAVED_ASSIGNMENT_PROMPT_LENGTH + 1),
        submitForGrade: true,
        pointValue: 100,
        gradingAssistantStrictnessLevel: 'intermediate',
        tutorEnabled: true,
      })
    ).rejects.toBeInstanceOf(SavedAssignmentError);
    expect(prisma.savedAssignment.upsert).not.toHaveBeenCalled();
  });
});

describe('listSavedAssignments', () => {
  beforeEach(() => {
    prisma.savedAssignment.findMany.mockReset();
    prisma.savedAssignment.findMany.mockResolvedValue([
      row(),
      row({ id: 'saved-2', title: 'Narrative Essay' }),
    ]);
  });

  test('scopes the query to this teacher, newest first', async () => {
    const saved = await listSavedAssignments({ membershipId: 'teacher-1' });

    const args = prisma.savedAssignment.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      membershipId: 'teacher-1',
      archivedAt: null,
      assignmentType: { archivedAt: null },
    });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(saved.map((entry) => entry.id)).toEqual(['saved-1', 'saved-2']);
    expect(saved[0].assignmentTypeTitle).toBe('Essay');
    expect(saved[0].savedAt).toBe('2026-08-08T12:00:00.000Z');
  });
});

describe('archiveSavedAssignment', () => {
  beforeEach(() => {
    prisma.savedAssignment.updateMany.mockReset();
    prisma.savedAssignment.updateMany.mockResolvedValue({ count: 1 });
  });

  test('archives only a row this teacher owns', async () => {
    const archived = await archiveSavedAssignment({
      membershipId: 'teacher-1',
      savedAssignmentId: 'saved-1',
    });

    expect(archived).toBe(true);
    const args = prisma.savedAssignment.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      id: 'saved-1',
      membershipId: 'teacher-1',
      archivedAt: null,
    });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });

  test('reports a miss when the row belongs to someone else', async () => {
    prisma.savedAssignment.updateMany.mockResolvedValue({ count: 0 });

    const archived = await archiveSavedAssignment({
      membershipId: 'teacher-2',
      savedAssignmentId: 'saved-1',
    });

    expect(archived).toBe(false);
  });
});
