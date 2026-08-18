import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { submission: { findFirst: mock(), update: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));

const { GroupGradeError, readGroupGrade, recordGroupGrade, effectiveGrade } =
  await import('./group-grade.server');

afterAll(() => {
  mock.restore();
});

describe('readGroupGrade', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset().mockResolvedValue({
      id: 'sub-1',
      score: 'B+',
      feedback: 'Solid report.',
      submittedAt: new Date('2026-08-18T09:00:00Z'),
      releasedAt: null,
    });
  });

  test('reads the group’s live submission', async () => {
    const grade = await readGroupGrade({ documentId: 'doc-1' });

    expect(grade).toEqual({
      submissionId: 'sub-1',
      score: 'B+',
      feedback: 'Solid report.',
      submittedAt: '2026-08-18T09:00:00.000Z',
      releasedAt: null,
    });
  });

  test('ignores an unsubmitted submission', async () => {
    await readGroupGrade({ documentId: 'doc-1' });

    expect(prisma.submission.findFirst.mock.calls[0][0].where.unsubmittedAt).toBeNull();
  });

  test('an unsubmitted draft has no group grade', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    await expect(readGroupGrade({ documentId: 'doc-1' })).resolves.toBeNull();
  });
});

describe('recordGroupGrade', () => {
  beforeEach(() => {
    prisma.submission.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'sub-1' });
    prisma.submission.update.mockReset().mockResolvedValue({});
  });

  const record = (overrides = {}) =>
    recordGroupGrade({
      documentId: 'doc-1',
      gradedByMembershipId: 'teacher-1',
      score: 'B+',
      feedback: 'Solid report.',
      ...overrides,
    });

  test('records the grade against the group’s submission', async () => {
    await record();

    const call = prisma.submission.update.mock.calls[0][0];
    expect(call.where.id).toBe('sub-1');
    expect(call.data.score).toBe('B+');
    expect(call.data.gradedByMembershipId).toBe('teacher-1');
    expect(call.data.gradedAt).toBeInstanceOf(Date);
  });

  test('refuses to grade a draft the group has not submitted', async () => {
    // Grading unsubmitted work would grade a moving target.
    prisma.submission.findFirst.mockResolvedValue(null);

    await expect(record()).rejects.toThrow(GroupGradeError);
    expect(prisma.submission.update).not.toHaveBeenCalled();
  });

  test('stays unreleased until asked', async () => {
    await record();

    expect(prisma.submission.update.mock.calls[0][0].data.releasedAt).toBeUndefined();
  });

  test('releasing stamps a time, taking it back clears it', async () => {
    await record({ release: true });
    expect(prisma.submission.update.mock.calls[0][0].data.releasedAt).toBeInstanceOf(Date);

    prisma.submission.update.mockClear();
    await record({ release: false });
    expect(prisma.submission.update.mock.calls[0][0].data.releasedAt).toBeNull();
  });
});

describe('effectiveGrade', () => {
  const groupGrade = { score: 'B+', releasedAt: null } as any;

  test('a follower shows the group’s grade', () => {
    // Derived, never copied: re-grading the group moves every follower at once.
    expect(
      effectiveGrade({
        member: { followsGroupGrade: true, score: null },
        groupGrade,
      })
    ).toEqual({ score: 'B+', source: 'group' });
  });

  test('an override shows the student’s own grade', () => {
    expect(
      effectiveGrade({
        member: { followsGroupGrade: false, score: 'A-' },
        groupGrade,
      })
    ).toEqual({ score: 'A-', source: 'individual' });
  });

  test('a follower with no group grade yet has nothing', () => {
    expect(
      effectiveGrade({
        member: { followsGroupGrade: true, score: null },
        groupGrade: null,
      })
    ).toEqual({ score: null, source: 'none' });
  });

  test('an override stands even before the group is graded', () => {
    // A teacher can grade a student's contribution without grading the report.
    expect(
      effectiveGrade({
        member: { followsGroupGrade: false, score: 'A-' },
        groupGrade: null,
      })
    ).toEqual({ score: 'A-', source: 'individual' });
  });

  test('a student with no row at all follows the group', () => {
    expect(effectiveGrade({ member: undefined, groupGrade })).toEqual({
      score: 'B+',
      source: 'group',
    });
  });
});
