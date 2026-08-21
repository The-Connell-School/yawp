import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
  classAssignment: { findMany: mock() },
  document: { findMany: mock() },
  submission: { findMany: mock() },
};
const getAvailableAssignmentTypesForScopes = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/assignment-type-access.server', () => ({
  getAvailableAssignmentTypesForScopes,
}));

const { loadStudentClassDetail } = await import('./student-class-detail.server');

afterAll(() => {
  mock.restore();
});

describe('student class detail visibility', () => {
  beforeEach(() => {
    prisma.class.findFirst.mockReset();
    prisma.classAssignment.findMany.mockReset();
    prisma.document.findMany.mockReset();
    prisma.submission.findMany.mockReset();
    getAvailableAssignmentTypesForScopes.mockReset();

    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      grade: '9',
      period: '2',
      title: 'World History',
      classArtIndex: null,
      classArtKey: null,
      school: { id: 'school-1', name: 'Tallassee', organizationId: 'org-1' },
      teachers: [{ id: 'teacher-1', user: { name: 'T' } }],
    });
    prisma.classAssignment.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
    getAvailableAssignmentTypesForScopes.mockResolvedValue([]);
  });

  test('applies postAt visibility gate for student assignment listings', async () => {
    await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    const where = prisma.classAssignment.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        classId: 'class-1',
        OR: [{ postAt: null }, { postAt: expect.objectContaining({ lte: expect.any(Date) }) }],
      })
    );
  });
});

