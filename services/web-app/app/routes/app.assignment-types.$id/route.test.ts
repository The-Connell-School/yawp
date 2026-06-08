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
  featureAccessTarget: {
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
const isApHistoryEssayEnabledForContext = mock();
const getAssignmentsEnabledClassIdsForContext = mock();
const getAssignmentCreationStandardizationEnabledClassIdsForContext = mock();

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
  getAssignmentCreationStandardizationEnabledClassIdsForContext,
  isApHistoryEssayEnabledForContext,
  getAssignmentsEnabledClassIdsForContext,
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
  organizationId = 'org-1',
} = {}) {
  prisma.assignmentType.findFirst.mockImplementation(async (args: any) =>
    args.select?.organizationAssignments
      ? { id, organizationAssignments: [{ organizationId }] }
      : { id, systemKey }
  );
}

describe('app.assignment-types.$id action', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.class.findMany.mockReset();
    prisma.featureAccessTarget.findMany.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    createDocumentForAssignmentType.mockReset();
    redirectWithToast.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
    });
    prisma.class.findMany.mockResolvedValue([]);
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
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
        organizationAssignments: {
          select: { organizationId: true },
        },
      },
    });
    expect(prisma.assignmentType.findFirst).toHaveBeenNthCalledWith(2, {
      where: { archivedAt: null, id: 'at-1' },
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
    mockActionAssignmentTypeAvailable({
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
    prisma.assignmentType.findMany.mockReset();
    prisma.document.findMany.mockReset();
    prisma.class.findMany.mockReset();
    prisma.featureAccessTarget.findMany.mockReset();
    prisma.apHistoryPromptLibraryEntry.findMany.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    redirectWithToast.mockReset();
    isApHistoryEssayEnabledForContext.mockReset();
    getAssignmentsEnabledClassIdsForContext.mockReset();
    getAssignmentCreationStandardizationEnabledClassIdsForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.assignmentType.findMany.mockResolvedValue([
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
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
    prisma.apHistoryPromptLibraryEntry.findMany.mockResolvedValue([]);
    isApHistoryEssayEnabledForContext.mockResolvedValue(true);
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue(['class-1']);
    getAssignmentCreationStandardizationEnabledClassIdsForContext.mockResolvedValue(
      ['class-1']
    );
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

  test('filters teacher classes to standardized classes when standardization is partially enabled', async () => {
    prisma.class.findMany.mockResolvedValueOnce([
      {
        id: 'class-1',
        grade: '9th',
        period: '1st',
        title: 'Legacy section',
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
      {
        id: 'class-2',
        grade: '10th',
        period: '2nd',
        title: 'Standardized section',
        school: { id: 'school-2', organizationId: 'org-2' },
        teachers: [{ id: 'teacher-2' }],
      },
    ]);
    getAssignmentsEnabledClassIdsForContext.mockResolvedValueOnce([
      'class-1',
      'class-2',
    ]);
    getAssignmentCreationStandardizationEnabledClassIdsForContext.mockResolvedValueOnce(
      ['class-2']
    );

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.assignmentCreationStandardizationEnabled).toBe(true);
    expect(response.data.teacherClasses).toEqual([
      {
        id: 'class-2',
        grade: '10th',
        period: '2nd',
        title: 'Standardized section',
        school: { id: 'school-2', organizationId: 'org-2' },
        teachers: [{ id: 'teacher-2' }],
      },
    ]);
    expect(
      getAssignmentCreationStandardizationEnabledClassIdsForContext
    ).toHaveBeenCalledWith({
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
    prisma.assignmentType.findMany.mockResolvedValueOnce([
      withOrganizationAssignment(makeAssignmentType({ title: 'E2E Course' })),
    ]);

    const otherTypeResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(otherTypeResponse.data.promptLibrary).toBeNull();
  });

  test('provides AP History library entries for teachers when assignments and AP History are enabled', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
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
      ],
    });
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      schoolIds: ['school-1'],
      teacherProfileId: 'teacher-1',
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-1'],
    });
  });

  test('provides AP History library for mixed class-scoped pilots using only eligible classes', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
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
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue([
      'class-1',
      'class-2',
    ]);
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
      {
        id: 'class-1',
        grade: '9th',
        period: '1st',
        title: null,
        school: { id: 'school-1', organizationId: 'org-1' },
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
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      schoolIds: ['school-1'],
      teacherProfileId: 'teacher-1',
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-1'],
    });
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      schoolIds: ['school-2'],
      teacherProfileId: 'teacher-1',
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-2'],
    });
  });

  test('omits AP History library when AP feature access is disabled', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({
          title: 'AP History Essay',
          systemKey: 'ap_history_essay',
        })
      ),
    ]);
    isApHistoryEssayEnabledForContext.mockResolvedValue(false);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });

  test('omits AP History library when no classes are eligible', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({
          title: 'AP History Essay',
          systemKey: 'ap_history_essay',
        })
      ),
    ]);
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue([]);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(isApHistoryEssayEnabledForContext).not.toHaveBeenCalled();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });

  test('omits AP History library for non-AP assignment types', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({ title: 'Rhetorical Analysis', systemKey: null })
      ),
    ]);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(response.data.apHistoryLibrary).toBeNull();
    expect(isApHistoryEssayEnabledForContext).not.toHaveBeenCalled();
    expect(prisma.apHistoryPromptLibraryEntry.findMany).not.toHaveBeenCalled();
  });
});
