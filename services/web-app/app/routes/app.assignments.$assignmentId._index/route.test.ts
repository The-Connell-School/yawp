import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findMany: mock() },
  classAssignmentInsight: { findUnique: mock() },
  submission: { count: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const getAvailableAssignmentTypesForScopes = mock();

// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copy test-preload.ts captured
// before any file could mock.module() this path (see comment there).
const actualAssignmentTypeAccess = globalThis.__realModules[
  '~/utils/assignment-type-access.server'
];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/assignment-type-access.server', () => ({
  ...actualAssignmentTypeAccess,
  getAvailableAssignmentTypesForScopes,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/utils/assignment-type-access.server',
    () => actualAssignmentTypeAccess
  );
});

const OPENED_AT = new Date('2026-08-17T12:00:00Z');

const deployment = ({
  collaborationEnabled = false,
  documentGroups = [] as { openedAt: Date | null }[],
} = {}) => ({
  id: 'class-assignment-1',
  classId: 'class-1',
  class: {
    id: 'class-1',
    grade: '10',
    period: '3',
    title: 'English',
    school: {
      id: 'school-1',
      organizationId: 'org-1',
      organization: { classInsightsEnabled: false },
    },
  },
  assignment: {
    id: 'assignment-1',
    title: 'Expansion Plan',
    prompt: 'Write it.',
    promptAttachmentName: null,
    submitForGrade: true,
    pointValue: 100,
    tutorEnabled: true,
    collaborationEnabled,
    gradingAssistantStrictnessLevel: 'intermediate',
    assignmentTypeId: 'at-1',
    assignmentType: { id: 'at-1', title: 'GBA 300', systemKey: null },
  },
  _count: { documents: 0 },
  documentGroups,
});

const get = () =>
  loader({
    request: new Request('https://example.com/app/assignments/assignment-1'),
    params: { assignmentId: 'assignment-1' },
  } as any);

describe('app.assignments.$assignmentId loader', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership
      .mockReset()
      .mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockReset().mockResolvedValue([deployment()]);
    prisma.classAssignmentInsight.findUnique.mockReset().mockResolvedValue(null);
    prisma.submission.count.mockReset().mockResolvedValue(0);
    getAvailableAssignmentTypesForScopes.mockReset().mockResolvedValue([]);
  });

  test('scopes deployments to classes this teacher actually teaches', async () => {
    await get();

    const where = prisma.classAssignment.findMany.mock.calls[0][0].where;
    expect(where.class).toEqual({ teachers: { some: { id: 'teacher-1' } } });
  });

  test('a student is redirected away', async () => {
    requireMembership.mockResolvedValue({ id: 'student-1', role: 'STUDENT' });

    const result: any = await get();

    expect(result.status ?? result.init?.status).toBe(302);
  });

  describe('collaboration', () => {
    test('is null for an ordinary solo assignment', async () => {
      // Nothing about group setup should appear on assignments that have none.
      const data: any = await get();

      expect(data.collaboration).toBeNull();
    });

    test('reports no groups yet for a collaborative assignment', async () => {
      prisma.classAssignment.findMany.mockResolvedValue([
        deployment({ collaborationEnabled: true }),
      ]);

      const data: any = await get();

      expect(data.collaboration).toEqual({ groupCount: 0, groupsOpened: false });
    });

    test('reports arranged-but-unopened groups', async () => {
      // The teacher shuffled and left; the assignment is not yet startable.
      prisma.classAssignment.findMany.mockResolvedValue([
        deployment({
          collaborationEnabled: true,
          documentGroups: [{ openedAt: null }, { openedAt: null }],
        }),
      ]);

      const data: any = await get();

      expect(data.collaboration).toEqual({ groupCount: 2, groupsOpened: false });
    });

    test('reports opened groups', async () => {
      prisma.classAssignment.findMany.mockResolvedValue([
        deployment({
          collaborationEnabled: true,
          documentGroups: [{ openedAt: OPENED_AT }, { openedAt: OPENED_AT }],
        }),
      ]);

      const data: any = await get();

      expect(data.collaboration).toEqual({ groupCount: 2, groupsOpened: true });
    });

    test('is reported for the class being viewed, not the first one deployed to', async () => {
      // Groups are arranged per class, so an assignment can be open in one
      // section and untouched in another. The page must describe the section
      // the teacher is actually looking at.
      const first = deployment({ collaborationEnabled: true });
      const second = {
        ...deployment({
          collaborationEnabled: true,
          documentGroups: [{ openedAt: OPENED_AT }],
        }),
        id: 'class-assignment-2',
        classId: 'class-2',
      };
      prisma.classAssignment.findMany.mockResolvedValue([first, second]);

      const data: any = await loader({
        request: new Request(
          'https://example.com/app/assignments/assignment-1?classId=class-2'
        ),
        params: { assignmentId: 'assignment-1' },
      } as any);

      expect(data.activeClassId).toBe('class-2');
      expect(data.assignment.classAssignmentId).toBe('class-assignment-2');
      expect(data.collaboration).toEqual({ groupCount: 1, groupsOpened: true });
    });
  });
});
