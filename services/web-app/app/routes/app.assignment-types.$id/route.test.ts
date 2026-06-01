import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findFirst: mock(),
  },
  document: {
    findMany: mock(),
  },
  class: {
    findMany: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();
const createDocumentForAssignmentType = mock();
const redirectWithToast = mock();
const getAssignmentsEnabledClassIdsForContext = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType,
  DocumentCreationError: class DocumentCreationError extends Error {},
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));
mock.module('~/utils/feature-flags.server', () => ({
  getAssignmentsEnabledClassIdsForContext,
}));

const { action, loader } = await import('./route');

function makeAssignmentType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'at-1',
    title: 'Daily Pages',
    description: 'Daily writing',
    archivedAt: null,
    image: null,
    assignmentModules: [
      {
        id: 'module-1',
        title: 'Daily Pages',
        description: 'Daily writing practice.',
      },
    ],
    ...overrides,
  };
}

describe('app.assignment-types.$id action', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    createDocumentForAssignmentType.mockReset();
    redirectWithToast.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
    });
    prisma.assignmentType.findFirst.mockResolvedValue({ id: 'at-1' });
    createDocumentForAssignmentType.mockResolvedValue({ documentId: 'doc-1' });
    redirectWithToast.mockImplementation((url, toast) => ({
      redirectedTo: url,
      toast,
    }));
  });

  test('requires assignment type availability before creating a document', async () => {
    await action({
      request: new Request('https://example.test/app/assignment-types/at-1', {
        method: 'POST',
      }),
      params: { id: 'at-1' },
    } as never);

    expect(prisma.assignmentType.findFirst).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        id: 'at-1',
        organizationAssignments: {
          some: { organizationId: 'org-1' },
        },
      },
      select: { id: true },
    });
    expect(createDocumentForAssignmentType).toHaveBeenCalledWith({
      profileId: 'profile-1',
      assignmentTypeId: 'at-1',
    });
  });

  test('rejects direct document creation for unavailable assignment types', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(null);

    const response = await action({
      request: new Request('https://example.test/app/assignment-types/at-2', {
        method: 'POST',
      }),
      params: { id: 'at-2' },
    } as never);

    expect(response as unknown).toEqual({
      redirectedTo: '/app',
      toast: {
        type: 'error',
        description: 'Assignment type not found',
      },
    });
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });
});

describe('app.assignment-types.$id loader Daily Pages prompt library', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.document.findMany.mockReset();
    prisma.class.findMany.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    redirectWithToast.mockReset();
    getAssignmentsEnabledClassIdsForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.assignmentType.findFirst.mockResolvedValue(makeAssignmentType());
    prisma.document.findMany.mockResolvedValue([]);
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        grade: '9th',
        period: '1st',
        title: null,
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
    ]);
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue(['class-1']);
  });

  test('provides prompt library data for teachers viewing Daily Pages', async () => {
    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.promptLibrary).toMatchObject({
      totalCount: 200,
    });
    expect(response.data.promptLibrary.prompts[0]).toMatchObject({
      prompt:
        'I am the captain of my destiny. Agree or disagree and explain your rationale.',
    });
    expect(response.data.promptLibrary.facets.textsOrUnits).toContain(
      'Macbeth'
    );
  });

  test('filters teacher classes to assignment-enabled classes', async () => {
    prisma.class.findMany.mockResolvedValueOnce([
      {
        id: 'class-1',
        grade: '9th',
        period: '1st',
        title: null,
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
      {
        id: 'class-2',
        grade: '10th',
        period: '2nd',
        title: 'Enabled section',
        school: { id: 'school-2', organizationId: 'org-2' },
        teachers: [{ id: 'teacher-2' }],
      },
    ]);
    getAssignmentsEnabledClassIdsForContext.mockResolvedValueOnce(['class-2']);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.teacherClasses).toEqual([
      {
        id: 'class-2',
        grade: '10th',
        period: '2nd',
        title: 'Enabled section',
        school: { id: 'school-2', organizationId: 'org-2' },
        teachers: [{ id: 'teacher-2' }],
      },
    ]);
    expect(getAssignmentsEnabledClassIdsForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classes: [
        {
          id: 'class-1',
          organizationId: 'org-1',
          schoolId: 'school-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          id: 'class-2',
          organizationId: 'org-2',
          schoolId: 'school-2',
          teacherProfileIds: ['teacher-2'],
        },
      ],
    });
  });

  test('omits prompt library for student profiles and other assignment types', async () => {
    requireProfile.mockResolvedValueOnce({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: null,
    });

    const studentResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(studentResponse.data.promptLibrary).toBeNull();

    requireProfile.mockResolvedValueOnce({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.assignmentType.findFirst.mockResolvedValueOnce(
      makeAssignmentType({ title: 'E2E Course' })
    );

    const otherTypeResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(otherTypeResponse.data.promptLibrary).toBeNull();
  });
});
