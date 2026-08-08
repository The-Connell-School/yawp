import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findMany: mock() },
  class: { findMany: mock() },
};
const requireUserId = mock();
const requireMembership = mock();
const listSavedAssignments = mock();
const archiveSavedAssignment = mock();
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
mock.module('~/domain/assignments/saved-assignments.server', () => ({
  SAVED_ASSIGNMENTS_ENABLED: true,
  listSavedAssignments,
  archiveSavedAssignment,
}));

const { action, loader } = await import('./route');

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
          _count: { documents: 3 },
        },
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
          },
        },
      })
    );
    expect(result).toMatchObject({
      assignments: [
        {
          classAssignmentId: 'ca-1',
          assignmentId: 'assignment-1',
          title: 'Essay One',
          assignmentTypeTitle: 'Essay',
          documentCount: 3,
          classId: 'class-1',
          classLabel: 'Grade 9th • Period 1st',
        },
      ],
    });
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
          _count: { documents: 0 },
        },
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
  test('hands the page this teacher\'s saved assignments and what it takes to reuse one', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockResolvedValue([]);
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', grade: '9th', period: '1st', title: null,
        school: { id: 'school-1', organizationId: 'org-1' } },
    ]);
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      { id: 'at-1', title: 'Essay', systemKey: null },
      { id: 'ap-1', title: 'AP History Essay', systemKey: 'ap_history_essay' },
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
    expect(result.savedAssignments[0].title).toBe('Rhetorical Analysis Essay');
    expect(result.assignmentCreationClasses).toEqual([
      { id: 'class-1', name: 'Grade 9th • Period 1st' },
    ]);
    // AP History assignments come from their own library, not a saved prompt.
    expect(result.assignmentCreationTypes).toEqual([
      { id: 'at-1', title: 'Essay' },
    ]);
  });

  test('does not read saved assignments for a non-teacher', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });

    await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any);

    expect(listSavedAssignments).not.toHaveBeenCalled();
  });
});

describe('My Assignments action', () => {
  beforeEach(() => {
    archiveSavedAssignment.mockReset().mockResolvedValue(true);
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset();
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
