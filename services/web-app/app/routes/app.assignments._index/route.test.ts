import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findMany: mock() },
  class: { findMany: mock(), findFirst: mock() },
  documentGroup: { findFirst: mock() },
  // The loader reads the creation types' rubrics and kinds, to know which
  // offer the grammar toggle and which suggest a writing time.
  assignmentType: { findMany: mock(async () => []) },
};
const requireUserId = mock();
const requireMembership = mock();
const deleteClassAssignmentDeployment = mock();
class AssignmentHasCollaborativeWorkError extends Error {}
const listSavedAssignments = mock();
const archiveSavedAssignment = mock();
const getAvailableAssignmentTypesForScopes = mock();
// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copy test-preload.ts captured
// before any file could mock.module() this path (see comment there).
const actualAssignmentTypeAccess =
  globalThis.__realModules['~/utils/assignment-type-access.server'];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/assignment-deployment.server', () => ({
  AssignmentHasCollaborativeWorkError,
  deleteClassAssignmentDeployment,
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  ...actualAssignmentTypeAccess,
  getAvailableAssignmentTypesForScopes,
}));
mock.module('~/domain/assignments/saved-assignments.server', () => ({
  SAVED_ASSIGNMENTS_ENABLED: true,
  listSavedAssignments,
  archiveSavedAssignment,
}));

const { action, loader } = await import('./route');
// The loader reads the feature switch from the client-safe module, which is
// deliberately not mocked here: these expectations follow the real flag rather
// than a stand-in, so switching the feature changes the suite honestly.
const { SAVED_ASSIGNMENTS_ENABLED } =
  await import('~/domain/assignments/saved-assignments');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/utils/assignment-type-access.server',
    () => actualAssignmentTypeAccess
  );
});

function makeRequest() {
  return new Request('https://example.test/app/assignments');
}

function removeRequest(body: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.append(key, value);
  return new Request('https://example.test/app/assignments', {
    method: 'POST',
    body: form,
  });
}

describe('My Assignments loader', () => {
  beforeEach(() => {
    prisma.classAssignment.findMany.mockReset();
    prisma.documentGroup.findFirst.mockReset().mockResolvedValue(null);
    prisma.class.findMany.mockReset().mockResolvedValue([]);
    listSavedAssignments.mockReset().mockResolvedValue([]);
    archiveSavedAssignment.mockReset().mockResolvedValue(true);
    getAvailableAssignmentTypesForScopes.mockReset().mockResolvedValue([]);
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireUserId.mockResolvedValue('user-1');
  });

  test('redirects non-teachers to the dashboard', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });

    const response = await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe('/app');
    expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();
  });

  test('scopes assignments to classes the teacher teaches', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        class: { id: 'class-1', grade: '9th', period: '1st', title: null },
        assignment: {
          id: 'assignment-1',
          title: 'Essay One',
          assignmentType: { title: 'Essay' },
        },
        _count: { documents: 3 },
      },
    ]);

    const result = await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any);

    expect(prisma.classAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          class: {
            teachers: { some: { id: 'profile-1' } },
            isArchived: false,
            // Scoped to the teacher's school year, like every other surface.
            schoolYear: expect.any(String),
          },
        },
      })
    );
    expect(result).toMatchObject({
      assignments: [
        {
          assignmentId: 'assignment-1',
          title: 'Essay One',
          assignmentTypeTitle: 'Essay',
          documentCount: 3,
          classLabel: 'Grade 9th • Period 1st',
          classes: [{ id: 'class-1', label: 'Grade 9th • Period 1st' }],
          href: '/app/assignments/assignment-1?classId=class-1',
        },
      ],
    });
  });

  // One Assignment deployed to several classes is one assignment, not several.
  // The old list rendered a ClassAssignment per row, so it repeated the same
  // assignment once per class and printed the cross-class document total on
  // every one of those rows.
  test('collapses one assignment deployed to several classes into a single row', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    const assignment = {
      id: 'assignment-1',
      title: 'Essay One',
      assignmentType: { title: 'Essay' },
    };
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        class: { id: 'class-1', grade: '9th', period: '1st', title: null },
        assignment,
        _count: { documents: 3 },
      },
      {
        id: 'ca-2',
        class: { id: 'class-2', grade: '9th', period: '2nd', title: null },
        assignment,
        _count: { documents: 4 },
      },
    ]);

    const result = (await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any)) as any;

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toMatchObject({
      assignmentId: 'assignment-1',
      documentCount: 7,
      classLabel: 'Grade 9th • Period 1st, Grade 9th • Period 2nd',
      classes: [
        { id: 'class-1', label: 'Grade 9th • Period 1st' },
        { id: 'class-2', label: 'Grade 9th • Period 2nd' },
      ],
    });
    // With more than one class there is no single class to scope the detail
    // page to; it picks the first deployment and offers its own class picker.
    expect(result.assignments[0].href).toBe('/app/assignments/assignment-1');
  });

  test('counts documents per class deployment rather than across the assignment', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        class: { id: 'class-1', grade: '9th', period: '1st', title: null },
        assignment: {
          id: 'assignment-1',
          title: 'Essay One',
          assignmentType: { title: 'Essay' },
        },
        _count: { documents: 2 },
      },
    ]);

    await loader({ request: makeRequest(), params: {}, context: {} } as any);

    const [args] = prisma.classAssignment.findMany.mock.calls[0];
    expect(args.select._count).toEqual({ select: { documents: true } });
    expect(args.select.assignment.select._count).toBeUndefined();
  });

  test('falls back to "Untitled Assignment" when the title is blank', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-2',
        class: { id: 'class-2', grade: '10th', period: '2nd', title: 'Honors' },
        assignment: {
          id: 'assignment-2',
          title: '   ',
          assignmentType: { title: 'Prompt' },
        },
        _count: { documents: 0 },
      },
    ]);

    const result = (await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any)) as { assignments: { title: string; classLabel: string }[] };

    expect(result.assignments[0].title).toBe('Untitled Assignment');
    expect(result.assignments[0].classLabel).toBe(
      'Honors · Grade 10th • Period 2nd'
    );
  });
  test.skipIf(!SAVED_ASSIGNMENTS_ENABLED)(
    "hands the page this teacher's saved assignments and what it takes to reuse one",
    async () => {
      requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
      prisma.classAssignment.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([
        {
          id: 'class-1',
          grade: '9th',
          period: '1st',
          title: null,
          school: { id: 'school-1', organizationId: 'org-1' },
        },
      ]);
      getAvailableAssignmentTypesForScopes.mockResolvedValue([
        { id: 'at-1', title: 'Essay', systemKey: null },
        {
          id: 'ap-1',
          title: 'AP History Essay',
          systemKey: 'ap_history_essay',
        },
      ]);
      listSavedAssignments.mockResolvedValue([
        {
          id: 'saved-1',
          title: 'Rhetorical Analysis Essay',
          prompt: 'Analyze the passage.',
          submitForGrade: true,
          pointValue: 100,
          gradingAssistantStrictnessLevel: 'intermediate',
          tutorEnabled: true,
          assignmentTypeId: 'at-1',
          assignmentTypeTitle: 'Essay',
          savedAt: '2026-08-08T12:00:00.000Z',
        },
      ]);

      const result = (await loader({
        request: makeRequest(),
        params: {},
        context: {},
      } as any)) as any;

      expect(listSavedAssignments).toHaveBeenCalledWith({
        membershipId: 'profile-1',
      });
      expect(result.savedAssignments).toHaveLength(1);
      expect(result.savedAssignments[0].title).toBe(
        'Rhetorical Analysis Essay'
      );
      expect(result.assignmentCreationClasses).toEqual([
        { id: 'class-1', name: 'Grade 9th • Period 1st' },
      ]);
      // AP History assignments come from their own library, not a saved prompt.
      expect(result.assignmentCreationTypes).toEqual([
        { id: 'at-1', title: 'Essay' },
      ]);
    }
  );

  test.skipIf(SAVED_ASSIGNMENTS_ENABLED)(
    'reads no saved assignments while the feature is switched off, but still arms the creation sheet',
    async () => {
      requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
      prisma.classAssignment.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([
        {
          id: 'class-1',
          grade: '9th',
          period: '1st',
          title: null,
          school: { id: 'school-1', organizationId: 'org-1' },
        },
      ]);
      getAvailableAssignmentTypesForScopes.mockResolvedValue([
        { id: 'at-1', title: 'Essay', systemKey: null },
      ]);

      const result = (await loader({
        request: makeRequest(),
        params: {},
        context: {},
      } as any)) as any;

      expect(listSavedAssignments).not.toHaveBeenCalled();
      expect(result.savedAssignments).toEqual([]);
      expect(result.assignmentCreationClasses).toEqual([
        { id: 'class-1', name: 'Grade 9th • Period 1st' },
      ]);
      expect(result.assignmentCreationTypes).toEqual([
        {
          id: 'at-1',
          title: 'Essay',
          collaborationSupported: undefined,
          // No rubric and no kind on the mocked type: no grammar toggle and
          // no suggested writing time.
          gradesGrammar: false,
          defaultWritingTimeMinutes: null,
          offersParagraphModes: false,
        },
      ]);
    }
  );

  test('does not read saved assignments for a non-teacher', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });

    await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any);

    expect(listSavedAssignments).not.toHaveBeenCalled();
  });

  test('carries the tutor setting so cold writes can be marked in the list', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        class: { id: 'class-1', grade: '9th', period: '1st', title: null },
        assignment: {
          id: 'assignment-1',
          title: 'Diagnostic Essay',
          tutorEnabled: false,
          assignmentType: { title: 'Essay' },
        },
        _count: { documents: 3 },
      },
      {
        id: 'ca-2',
        class: { id: 'class-1', grade: '9th', period: '1st', title: null },
        assignment: {
          id: 'assignment-2',
          title: 'Essay Two',
          tutorEnabled: true,
          assignmentType: { title: 'Essay' },
        },
        _count: { documents: 2 },
      },
    ]);

    const result = (await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any)) as any;

    const select = prisma.classAssignment.findMany.mock.calls[0][0].select;
    expect(select.assignment.select.tutorEnabled).toBe(true);
    expect(
      result.assignments.map((assignment: any) => [
        assignment.assignmentId,
        assignment.tutorEnabled,
      ])
    ).toEqual([
      ['assignment-1', false],
      ['assignment-2', true],
    ]);
  });
});

describe('My Assignments action', () => {
  beforeEach(() => {
    archiveSavedAssignment.mockReset().mockResolvedValue(true);
    deleteClassAssignmentDeployment.mockReset().mockResolvedValue('ca-1');
    prisma.classAssignment.findMany.mockReset().mockResolvedValue([]);
    prisma.documentGroup.findFirst.mockReset().mockResolvedValue(null);
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset();
  });

  describe('deleting assignments', () => {
    function deleteRequest(assignmentIds: string[]) {
      const form = new FormData();
      form.append('intent', 'delete-assignments');
      for (const id of assignmentIds) form.append('assignmentIds', id);
      return new Request('https://example.test/app/assignments', {
        method: 'POST',
        body: form,
      });
    }

    test("removes every deployment of the assignment in this teacher's classes", async () => {
      requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
      prisma.classAssignment.findMany.mockResolvedValue([
        { assignmentId: 'assignment-1', classId: 'class-1' },
        { assignmentId: 'assignment-1', classId: 'class-2' },
      ]);

      const response = (await action({
        request: deleteRequest(['assignment-1']),
        params: {},
        context: {},
      } as any)) as any;

      // Scoped to classes the teacher teaches, so an assignment shared with
      // someone else's class keeps its other deployments.
      expect(prisma.classAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            assignmentId: { in: ['assignment-1'] },
            class: {
              teachers: { some: { id: 'profile-1' } },
              isArchived: false,
            },
          },
        })
      );
      expect(deleteClassAssignmentDeployment).toHaveBeenCalledTimes(2);
      expect(deleteClassAssignmentDeployment).toHaveBeenCalledWith({
        assignmentId: 'assignment-1',
        classId: 'class-1',
      });
      expect(deleteClassAssignmentDeployment).toHaveBeenCalledWith({
        assignmentId: 'assignment-1',
        classId: 'class-2',
      });
      expect(response.success ?? response.data?.success).toBe(true);
    });

    test("deletes nothing when one of the ids is outside the teacher's classes", async () => {
      requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
      prisma.classAssignment.findMany.mockResolvedValue([
        { assignmentId: 'assignment-1', classId: 'class-1' },
      ]);

      const response = (await action({
        request: deleteRequest(['assignment-1', 'someone-elses-assignment']),
        params: {},
        context: {},
      } as any)) as any;

      expect(deleteClassAssignmentDeployment).not.toHaveBeenCalled();
      expect(response.init?.status ?? response.status).toBe(404);
    });

    test('protects assignments that already own shared group work', async () => {
      requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
      prisma.classAssignment.findMany.mockResolvedValue([
        { assignmentId: 'assignment-1', classId: 'class-1' },
      ]);
      prisma.documentGroup.findFirst.mockResolvedValue({ id: 'group-1' });

      const response = (await action({
        request: deleteRequest(['assignment-1']),
        params: {},
        context: {},
      } as any)) as any;

      expect(deleteClassAssignmentDeployment).not.toHaveBeenCalled();
      expect(response.init?.status ?? response.status).toBe(409);
    });

    test('refuses a non-teacher', async () => {
      requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });

      const response = (await action({
        request: deleteRequest(['assignment-1']),
        params: {},
        context: {},
      } as any)) as any;

      expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();
      expect(deleteClassAssignmentDeployment).not.toHaveBeenCalled();
      expect(response.init?.status ?? response.status).toBe(403);
    });

    test('rejects an empty selection', async () => {
      requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });

      const response = (await action({
        request: deleteRequest([]),
        params: {},
        context: {},
      } as any)) as any;

      expect(deleteClassAssignmentDeployment).not.toHaveBeenCalled();
      expect(response.init?.status ?? response.status).toBe(400);
    });
  });

  test('removes a saved assignment for the teacher who owns it', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });

    const response = (await action({
      request: removeRequest({
        intent: 'remove-saved-assignment',
        savedAssignmentId: 'saved-1',
      }),
      params: {},
      context: {},
    } as any)) as any;

    expect(archiveSavedAssignment).toHaveBeenCalledWith({
      membershipId: 'profile-1',
      savedAssignmentId: 'saved-1',
    });
    expect(response.success ?? response.data?.success).toBe(true);
  });

  test('refuses a non-teacher', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });

    const response = (await action({
      request: removeRequest({
        intent: 'remove-saved-assignment',
        savedAssignmentId: 'saved-1',
      }),
      params: {},
      context: {},
    } as any)) as any;

    expect(archiveSavedAssignment).not.toHaveBeenCalled();
    expect(response.init?.status ?? response.status).toBe(403);
  });

  test('rejects an unknown intent', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });

    const response = (await action({
      request: removeRequest({ intent: 'nope' }),
      params: {},
      context: {},
    } as any)) as any;

    expect(archiveSavedAssignment).not.toHaveBeenCalled();
    expect(response.init?.status ?? response.status).toBe(400);
  });
});
