import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const tx = {
  $queryRaw: mock(),
  documentGroupMember: { updateMany: mock() },
  orgMembership: { findUnique: mock(), update: mock() },
};
const prisma = {
  $transaction: mock(async (callback: any) => callback(tx)),
};
mock.module('~/utils/db.server', () => ({ prisma }));

const { replaceStudentClassRoster } = await import('./student-roster.server');

afterAll(() => mock.restore());

describe('replaceStudentClassRoster', () => {
  beforeEach(() => {
    prisma.$transaction
      .mockReset()
      .mockImplementation(async (callback: any) => callback(tx));
    tx.$queryRaw.mockReset().mockResolvedValue([]);
    tx.orgMembership.findUnique.mockReset().mockResolvedValue({
      classesAsStudent: [{ id: 'class-b' }, { id: 'class-a' }],
    });
    tx.documentGroupMember.updateMany
      .mockReset()
      .mockResolvedValue({ count: 1 });
    tx.orgMembership.update.mockReset().mockResolvedValue({ id: 'student-1' });
  });

  test('locks every affected class in stable order before replacing the roster', async () => {
    await replaceStudentClassRoster({
      membershipId: 'student-1',
      nextClassIds: ['class-c', 'class-b'],
    });

    expect(String(tx.$queryRaw.mock.calls[0][0])).toContain('OrgMembership');
    expect(tx.$queryRaw.mock.calls.slice(1).map((call) => call[1])).toEqual([
      'class-a',
      'class-b',
      'class-c',
    ]);
    expect(tx.orgMembership.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: {
        classesAsStudent: { set: [{ id: 'class-c' }, { id: 'class-b' }] },
      },
    });
  });

  test('soft-withdraws active shared-artifact memberships for removed classes', async () => {
    tx.orgMembership.findUnique.mockResolvedValue({
      classesAsStudent: [{ id: 'class-a' }, { id: 'class-b' }],
    });
    await replaceStudentClassRoster({
      membershipId: 'student-1',
      nextClassIds: ['class-b'],
    });

    const call = tx.documentGroupMember.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      membershipId: 'student-1',
      removedAt: null,
      group: {
        classAssignment: { classId: { in: ['class-a'] } },
      },
    });
    expect(call.data.removedAt).toBeInstanceOf(Date);
  });
});
