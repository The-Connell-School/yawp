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
  apHistoryPromptLibraryEntry: {
    findMany: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();
const createDocumentForAssignmentType = mock();
const redirectWithToast = mock();
const isAssignmentsEnabledForContext = mock();
const isApHistoryEssayEnabledForContext = mock();

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
  isAssignmentsEnabledForContext,
  isApHistoryEssayEnabledForContext,
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
      select: { id: true, systemKey: true },
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

  test('rejects direct document creation for AP History assignment types', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'ap-history-type',
      systemKey: 'ap_history_essay',
    });

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
        description: 'Choose an APUSH prompt from the library first.',
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
    prisma.apHistoryPromptLibraryEntry.findMany.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    redirectWithToast.mockReset();
    isAssignmentsEnabledForContext.mockReset();
    isApHistoryEssayEnabledForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.assignmentType.findFirst.mockResolvedValue(makeAssignmentType());
    prisma.document.findMany.mockResolvedValue([]);
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', grade: '9th', period: '1st', title: null },
    ]);
    prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([]);
    isAssignmentsEnabledForContext.mockResolvedValue(true);
    isApHistoryEssayEnabledForContext.mockResolvedValue(true);
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

  test('provides AP History library entries for teachers when assignments and AP History are enabled', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(
      makeAssignmentType({
        id: 'ap-history-type',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
      })
    );
    prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        externalKey: 'apush-dbq-period-3',
        title: 'Revolutionary Ideals DBQ',
        prompt: 'Evaluate the extent to which revolutionary ideals changed American society.',
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
      { id: 'class-1', grade: '9th', period: '1st', title: null },
    ]);
    expect(isAssignmentsEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
  });

  test('provides AP History library for mixed class-scoped pilots using only eligible classes', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(
      makeAssignmentType({
        id: 'ap-history-type',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
      })
    );
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', grade: '9th', period: '1st', title: null },
      { id: 'class-2', grade: '10th', period: '2nd', title: null },
    ]);
    prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        externalKey: 'apush-dbq-period-3',
        title: 'Revolutionary Ideals DBQ',
        prompt: 'Evaluate the extent to which revolutionary ideals changed American society.',
        essayType: 'dbq',
        period: 'Period 3: 1754-1800',
        periodNumber: 3,
        reasoningSkill: 'Causation',
        difficulty: 'medium',
        sources: [],
      },
    ]);
    isAssignmentsEnabledForContext.mockImplementation(({ classIds }) =>
      Promise.resolve(classIds[0] === 'class-1')
    );
    isApHistoryEssayEnabledForContext.mockImplementation(({ classIds }) =>
      Promise.resolve(classIds[0] === 'class-1')
    );

    const response = (await loader({
      request: new Request(
        'https://example.test/app/assignment-types/ap-history-type'
      ),
      params: { id: 'ap-history-type' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary.entries).toHaveLength(1);
    expect(response.data.apHistoryLibrary.teacherClasses).toEqual([
      { id: 'class-1', grade: '9th', period: '1st', title: null },
    ]);
    expect(response.data.teacherClasses).toEqual([
      { id: 'class-1', grade: '9th', period: '1st', title: null },
      { id: 'class-2', grade: '10th', period: '2nd', title: null },
    ]);
    expect(isAssignmentsEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
    expect(isAssignmentsEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-2'],
    });
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-2'],
    });
  });

  test('omits AP History library when AP feature access is disabled', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(
      makeAssignmentType({
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
      })
    );
    isApHistoryEssayEnabledForContext.mockResolvedValue(false);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });

  test('omits AP History library when no classes are eligible', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(
      makeAssignmentType({
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
      })
    );
    isAssignmentsEnabledForContext.mockResolvedValue(false);
    isApHistoryEssayEnabledForContext.mockResolvedValue(false);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });

  test('omits AP History library for non-AP assignment types', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(
      makeAssignmentType({ title: 'Rhetorical Analysis', systemKey: null })
    );

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(isAssignmentsEnabledForContext).not.toHaveBeenCalled();
    expect(isApHistoryEssayEnabledForContext).not.toHaveBeenCalled();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });
});
