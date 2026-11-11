import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignmentStudentFirstOpen: { createMany: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));

const { recordClassAssignmentFirstOpen } = await import(
  './student-class-assignment-first-open.server'
);

describe('recordClassAssignmentFirstOpen', () => {
  beforeEach(() => {
    prisma.classAssignmentStudentFirstOpen.createMany.mockReset();
  });

  test('persists a first-open row with skipDuplicates', async () => {
    await recordClassAssignmentFirstOpen({
      classAssignmentId: 'ca-1',
      membershipId: 'student-1',
    });

    expect(prisma.classAssignmentStudentFirstOpen.createMany).toHaveBeenCalledWith({
      data: [{ classAssignmentId: 'ca-1', membershipId: 'student-1' }],
      skipDuplicates: true,
    });
  });
});
