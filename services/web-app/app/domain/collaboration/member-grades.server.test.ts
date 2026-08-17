import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentGroupMemberGrade: { upsert: mock(), findMany: mock() },
  documentGroup: { findFirst: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { MemberGradeError, readMemberGrades, recordMemberGrade } = await import(
  './member-grades.server'
);

afterAll(() => {
  mock.restore();
});

const GROUP = 'group-1';

describe('recordMemberGrade', () => {
  beforeEach(() => {
    prisma.documentGroup.findFirst.mockReset().mockResolvedValue({
      id: GROUP,
      members: [{ membershipId: 'member-1' }, { membershipId: 'member-2' }],
    });
    prisma.documentGroupMemberGrade.upsert.mockReset().mockResolvedValue({});
  });

  const record = (overrides = {}) =>
    recordMemberGrade({
      groupId: GROUP,
      membershipId: 'member-1',
      gradedByMembershipId: 'teacher-1',
      score: '18/20',
      feedback: 'Strong PESTEL section.',
      ...overrides,
    });

  test('records the score and who gave it', async () => {
    await record();

    const call = prisma.documentGroupMemberGrade.upsert.mock.calls[0][0];
    expect(call.where.groupId_membershipId).toEqual({
      groupId: GROUP,
      membershipId: 'member-1',
    });
    expect(call.create.score).toBe('18/20');
    expect(call.create.gradedByMembershipId).toBe('teacher-1');
  });

  test('editing a grade replaces it rather than adding a second', async () => {
    await record();

    const call = prisma.documentGroupMemberGrade.upsert.mock.calls[0][0];
    expect(call.update.score).toBe('18/20');
    expect(call.update.feedback).toBe('Strong PESTEL section.');
  });

  test('is unreleased until the teacher says so', async () => {
    // Same guard Submission.releasedAt gives: nothing reaches a student while the
    // teacher is still working through the group.
    await record();

    expect(
      prisma.documentGroupMemberGrade.upsert.mock.calls[0][0].create.releasedAt
    ).toBeNull();
  });

  test('releasing stamps a time', async () => {
    await record({ release: true });

    const call = prisma.documentGroupMemberGrade.upsert.mock.calls[0][0];
    expect(call.create.releasedAt).toBeInstanceOf(Date);
    expect(call.update.releasedAt).toBeInstanceOf(Date);
  });

  test('un-releasing clears it again', async () => {
    // A teacher who released early has to be able to take it back.
    await record({ release: false });

    expect(
      prisma.documentGroupMemberGrade.upsert.mock.calls[0][0].update.releasedAt
    ).toBeNull();
  });

  test('refuses a student who is not in this group', async () => {
    // The membership id comes from a form, so being on the page is not proof it
    // names someone in the group.
    await expect(record({ membershipId: 'member-outsider' })).rejects.toThrow(
      MemberGradeError
    );
    expect(prisma.documentGroupMemberGrade.upsert).not.toHaveBeenCalled();
  });

  test('refuses a group that does not exist', async () => {
    prisma.documentGroup.findFirst.mockResolvedValue(null);

    await expect(record()).rejects.toThrow(MemberGradeError);
  });

  test('trims a score down to nothing rather than storing whitespace', async () => {
    await record({ score: '   ', feedback: '  ' });

    const call = prisma.documentGroupMemberGrade.upsert.mock.calls[0][0];
    expect(call.create.score).toBeNull();
    expect(call.create.feedback).toBeNull();
  });

  test('rejects a score longer than a score could reasonably be', async () => {
    // Free text so a teacher can write 18/20 or "meets expectations", but not an
    // essay -- that is what feedback is for.
    await expect(record({ score: 'x'.repeat(65) })).rejects.toThrow(
      /at most 64 characters/i
    );
  });
});

describe('readMemberGrades', () => {
  beforeEach(() => {
    prisma.documentGroupMemberGrade.findMany.mockReset().mockResolvedValue([
      {
        membershipId: 'member-1',
        score: '18/20',
        feedback: 'Strong.',
        releasedAt: new Date('2026-08-18T09:00:00Z'),
      },
      {
        membershipId: 'member-2',
        score: null,
        feedback: null,
        releasedAt: null,
      },
    ]);
  });

  test('keys grades by student for the panel to read', async () => {
    const grades = await readMemberGrades({ groupId: GROUP });

    expect(grades.get('member-1')).toEqual({
      score: '18/20',
      feedback: 'Strong.',
      releasedAt: '2026-08-18T09:00:00.000Z',
    });
  });

  test('an ungraded student is present with nothing set', async () => {
    const grades = await readMemberGrades({ groupId: GROUP });

    expect(grades.get('member-2')).toEqual({
      score: null,
      feedback: null,
      releasedAt: null,
    });
  });

  test('scopes to the group asked for', async () => {
    await readMemberGrades({ groupId: GROUP });

    expect(prisma.documentGroupMemberGrade.findMany.mock.calls[0][0].where).toEqual(
      { groupId: GROUP }
    );
  });
});
