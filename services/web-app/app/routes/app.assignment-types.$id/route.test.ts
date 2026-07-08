import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findFirst: mock(),
    findMany: mock(),
  },
  document: {
    findMany: mock(),
  },
  class: {
    findMany: mock(),
  },
  organizationAssignmentType: {
    findMany: mock(),
  },
  school: {
    findMany: mock(),
  },
  orgMembership: {
    findMany: mock(),
  },
  apHistoryPromptLibraryEntry: {
    findMany: mock(),
    findFirst: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const createDocumentForAssignmentType = mock();
const redirectWithToast = mock();
const getAvailableAssignmentTypesForScopes = mock();
const isAssignmentTypeAvailableForAnyScope = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType,
  DocumentCreationError: class DocumentCreationError extends Error {},
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  AssignmentTypeAccessScope: undefined,
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForAnyScope,
}));

const { action, loader } = await import('./route');

function makeAssignmentType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'at-1',
    title: 'Daily Pages',
    systemKey: null,
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

function withOrganizationAssignment(
  assignmentType: ReturnType<typeof makeAssignmentType>,
  organizationId = 'org-1'
) {
  return {
    ...assignmentType,
    organizationAssignments: [{ organizationId }],
  };
}

function mockActionAssignmentTypeAvailable({
  id = 'at-1',
  systemKey = null as string | null,
} = {}) {
  prisma.assignmentType.findFirst.mockImplementation(async (args: any) =>
    args.select?.systemKey !== undefined ? { id, systemKey } : { id }
  );
}

describe('app.assignment-types.$id action', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.class.findMany.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    createDocumentForAssignmentType.mockReset();
    redirectWithToast.mockReset();
    isAssignmentTypeAvailableForAnyScope.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });
    prisma.class.findMany.mockResolvedValue([]);
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'at-1' },
    ]);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    isAssignmentTypeAvailableForAnyScope.mockImplementation(
      async ({
        assignmentTypeId,
      }: {
        assignmentTypeId: string;
        scopes: unknown[];
      }) => {
        const assignmentType = await prisma.assignmentType.findFirst({
          where: { id: assignmentTypeId, archivedAt: null },
          select: { id: true },
        });
        if (!assignmentType) return false;
        const assignments = await prisma.organizationAssignmentType.findMany();
        return assignments.some(
          (assignment: { assignmentTypeId: string }) =>
            assignment.assignmentTypeId === assignmentTypeId
        );
      }
    );
    mockActionAssignmentTypeAvailable();
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

    expect(prisma.assignmentType.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'at-1', archivedAt: null },
      select: {
        id: true,
      },
    });
    expect(prisma.assignmentType.findFirst).toHaveBeenNthCalledWith(2, {
      where: { archivedAt: null, id: 'at-1' },
      select: { id: true, systemKey: true },
    });
    expect(createDocumentForAssignmentType).toHaveBeenCalledWith({
      membershipId: 'profile-1',
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

  test('prompts for an APUSH selection when none is provided', async () => {
    mockActionAssignmentTypeAvailable({
      id: 'ap-history-type',
      systemKey: 'ap_history_essay',
    });
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'ap-history-type' },
    ]);

    const response = await action({
      request: new Request(
        'https://example.test/app/assignment-types/ap-history-type',
        { method: 'POST' }
      ),
      params: { id: 'ap-history-type' },
    } as never);

    expect(response as unknown).toEqual({
      redirectedTo: '/app/assignment-types/ap-history-type',
      toast: {
        type: 'error',
        description: 'Choose an APUSH prompt to start practicing.',
      },
    });
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });

  test('creates a student practice document from an APUSH prompt', async () => {
    mockActionAssignmentTypeAvailable({
      id: 'ap-history-type',
      systemKey: 'ap_history_essay',
    });
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'ap-history-type' },
    ]);
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue({
      externalKey: 'apush-dbq-american-independence',
      course: 'apush',
      essayType: 'dbq',
      prompt: 'Evaluate the extent of change in ideas about independence.',
      period: '1754-1800',
      periodNumber: 3,
      reasoningSkill: 'continuity-and-change',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 60,
      sources: [],
    });
    createDocumentForAssignmentType.mockResolvedValue({ documentId: 'doc-9' });

    const form = new FormData();
    form.append('apHistoryLibraryEntryId', 'apush-dbq-american-independence');

    const response = (await action({
      request: new Request(
        'https://example.test/app/assignment-types/ap-history-type',
        { method: 'POST', body: form }
      ),
      params: { id: 'ap-history-type' },
    } as never)) as unknown as { redirectedTo: string };

    expect(response.redirectedTo).toContain('/app/documents/doc-9');
    const createArg = createDocumentForAssignmentType.mock.calls[0][0];
    expect(createArg.assignmentTypeId).toBe('ap-history-type');
    expect(createArg.apHistorySnapshot).toMatchObject({
      schemaVersion: 1,
      essayType: 'dbq',
      libraryEntryId: 'apush-dbq-american-independence',
    });
  });
});

describe('app.assignment-types.$id loader Daily Pages prompt library', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.document.findMany.mockReset();
    prisma.class.findMany.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.apHistoryPromptLibraryEntry.findMany.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    redirectWithToast.mockReset();
    getAvailableAssignmentTypesForScopes.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
    });
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(makeAssignmentType()),
    ]);
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
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'at-1' },
    ]);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([]);
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

  test('returns all teacher classes for assignment creation', async () => {
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

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.teacherClasses).toEqual([
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
  });

  test('omits prompt library for student profiles and other assignment types', async () => {
    requireMembership.mockResolvedValueOnce({
      id: 'profile-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });

    const studentResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(studentResponse.data.promptLibrary).toBeNull();

    requireMembership.mockResolvedValueOnce({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
    });
    prisma.assignmentType.findMany.mockResolvedValueOnce([
      withOrganizationAssignment(makeAssignmentType({ title: 'E2E Course' })),
    ]);
    getAvailableAssignmentTypesForScopes.mockResolvedValueOnce([
      withOrganizationAssignment(makeAssignmentType({ title: 'E2E Course' })),
    ]);

    const otherTypeResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(otherTypeResponse.data.promptLibrary).toBeNull();
  });

  test('provides AP History library entries for teachers', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({
          id: 'ap-history-type',
          title: 'AP History Essay',
          systemKey: 'ap_history_essay',
        })
      ),
    ]);
    prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        externalKey: 'apush-dbq-period-3',
        title: 'Revolutionary Ideals DBQ',
        prompt:
          'Evaluate the extent to which revolutionary ideals changed American society.',
        essayType: 'dbq',
        period: 'Period 3: 1754-1800',
        periodNumber: 3,
        reasoningSkill: 'Causation',
        difficulty: 'medium',
        sources: [{ id: 'source-1' }, { id: 'source-2' }],
      },
    ]);

    const response = (await loader({
      request: new Request(
        'https://example.test/app/assignment-types/ap-history-type'
      ),
      params: { id: 'ap-history-type' },
    } as never)) as any;

    expect(response.data.promptLibrary).toBeNull();
    expect(response.data.apHistoryLibrary.entries).toHaveLength(1);
    expect(response.data.apHistoryLibrary.entries[0]).toMatchObject({
      externalKey: 'apush-dbq-period-3',
      title: 'Revolutionary Ideals DBQ',
      essayType: 'dbq',
    });
    expect(response.data.apHistoryLibrary.teacherClasses).toEqual([
      {
        id: 'class-1',
        grade: '9th',
        period: '1st',
        title: null,
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
    ]);
  });

  test('provides AP History library for all teacher classes', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({
          id: 'ap-history-type',
          title: 'AP History Essay',
          systemKey: 'ap_history_essay',
        })
      ),
    ]);
    prisma.class.findMany.mockResolvedValue([
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
        title: null,
        school: { id: 'school-2', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
    ]);
    prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        externalKey: 'apush-dbq-period-3',
        title: 'Revolutionary Ideals DBQ',
        prompt:
          'Evaluate the extent to which revolutionary ideals changed American society.',
        essayType: 'dbq',
        period: 'Period 3: 1754-1800',
        periodNumber: 3,
        reasoningSkill: 'Causation',
        difficulty: 'medium',
        sources: [],
      },
    ]);

    const response = (await loader({
      request: new Request(
        'https://example.test/app/assignment-types/ap-history-type'
      ),
      params: { id: 'ap-history-type' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary.entries).toHaveLength(1);
    expect(response.data.apHistoryLibrary.teacherClasses).toEqual([
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
        title: null,
        school: { id: 'school-2', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
    ]);
    expect(response.data.teacherClasses).toEqual([
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
        title: null,
        school: { id: 'school-2', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
    ]);
  });

  test('omits AP History library when teacher has no classes', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({
          title: 'AP History Essay',
          systemKey: 'ap_history_essay',
        })
      ),
    ]);
    prisma.class.findMany.mockResolvedValue([]);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });

  test('omits AP History library for non-AP assignment types', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({ title: 'Rhetorical Analysis', systemKey: null })
      ),
    ]);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });
});
