import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
  documentClassForensic: { findMany: mock() },
  document: { findMany: mock() },
};
const resolveTeacherSchoolYearScope = mock(async () => '2026-2027');
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/school-year-scope.server', () => ({ resolveTeacherSchoolYearScope }));
const { loadGradingQueueNeighbors } = await import('./grading-queue.server');
const { parseGradingQueueScope } = await import('./grading-queue');

function row(index: number) {
  const id = String(index).padStart(4, '0');
  return {
    id, title: `Paper ${id}`, updatedAt: new Date('2026-09-15T10:00:00Z'),
    assignment: { id: 'assignment-1', title: 'Essay', submitForGrade: true, pointValue: 100 },
    classAssignment: { class: { id: 'class-1', title: 'English', grade: '9', period: '1' } },
    membership: { id: `student-${id}`, user: { id: `user-${id}`, name: `Student ${id}`, email: `${id}@test.invalid` }, classesAsStudent: [] },
    group: null,
    submissions: [{ id: `submission-${id}`, submittedAt: new Date('2026-09-15T10:00:00Z') }],
    _count: { submissions: 1 },
  };
}

const args = {
  request: new Request('https://yawp.test/app/submissions/submission-0000'),
  membershipId: 'teacher-1', organizationId: 'org-1', userId: 'teacher-user',
  submissionId: 'submission-0000', scope: parseGradingQueueScope('/app/documents?status=needs-grading')!,
  sort: { field: 'student' as const, direction: 'asc' as const },
};

describe('grading queue authorization and completeness', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset().mockResolvedValue([{ id: 'class-1', title: 'English', grade: '9', period: '1' }]);
    prisma.documentClassForensic.findMany.mockReset().mockResolvedValue([]);
    prisma.document.findMany.mockReset().mockResolvedValue([]);
    resolveTeacherSchoolYearScope.mockClear();
  });

  test('loads beyond the first250 documents with stable batches', async () => {
    prisma.document.findMany.mockResolvedValueOnce(Array.from({ length: 250 }, (_, i) => row(i)))
      .mockResolvedValueOnce([row(250)]);
    const queue = await loadGradingQueueNeighbors(args);
    expect(queue?.entries).toHaveLength(251);
    expect(queue?.entries[250].submissionId).toBe('submission-0250');
    expect(prisma.document.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: '0249' }, skip: 1, take: 250 });
  });

  test('enforces organization and non-self identity in addition to teacher-class scope', async () => {
    prisma.document.findMany.mockResolvedValue([row(0)]);
    await loadGradingQueueNeighbors(args);
    expect(prisma.class.findMany.mock.calls[0][0].where).toMatchObject({
      teachers: { some: { id: 'teacher-1' } }, school: { organizationId: 'org-1' }, isArchived: false,
    });
    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('org-1');
    expect(JSON.stringify(where)).toContain('teacher-user');
    expect(JSON.stringify(where)).toContain('class-1');
    expect(where.submissions).toEqual({ some: { unsubmittedAt: null } });
  });

  test('does not query documents when a forged class scope resolves to no authorized class', async () => {
    prisma.class.findMany.mockResolvedValue([]);
    const result = await loadGradingQueueNeighbors({ ...args, scope: parseGradingQueueScope('/app/my-classes/foreign-class?tab=documents')! });
    expect(result).toBeNull();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.class.findMany.mock.calls[0][0].where).toMatchObject({ id: 'foreign-class', teachers: { some: { id: 'teacher-1' } }, school: { organizationId: 'org-1' } });
  });
});
