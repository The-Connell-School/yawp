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
  },
  apEnglishLangPromptLibraryEntry: {
    findMany: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const createDocumentForAssignmentType = mock();
const redirectWithToast = mock();
const getAvailableAssignmentTypesForScopes = mock();

const assignmentTypeAccessActual = await import(
  '~/utils/assignment-type-access.server'
);

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
  ...assignmentTypeAccessActual,
  getAvailableAssignmentTypesForScopes,
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
    args.select?.systemKey !== undefined
      ? { id, systemKey }
      : { id }
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

  test('rejects direct document creation for AP History assignment types', async () => {
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
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.apHistoryPromptLibraryEntry.findMany.mockReset();
    prisma.apEnglishLangPromptLibraryEntry.findMany.mockReset();
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
    prisma.apEnglishLangPromptLibraryEntry.findMany.mockResolvedValue([]);
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

  describe('AP English Language prompt library', () => {
    const apEnglishLangEntries = [
      {
        id: 'ael-1',
        externalKey: 'ael-synthesis-school-start-times',
        title: 'School Start Times — Synthesis',
        prompt: 'Argue a position on later school start times.',
        frqType: 'synthesis',
        focusSkill: 'source-integration',
        difficulty: 'exam-ready',
        sources: [{ id: 's-1' }, { id: 's-2' }, { id: 's-3' }],
      },
      {
        id: 'ael-2',
        externalKey: 'ael-rhetorical-gettysburg',
        title: 'The Gettysburg Address — Rhetorical Analysis',
        prompt: 'Analyze the rhetorical choices Lincoln makes.',
        frqType: 'rhetorical_analysis',
        focusSkill: 'rhetorical-situation',
        difficulty: 'exam-ready',
        sources: [{ id: 's-4' }],
      },
      {
        id: 'ael-3',
        externalKey: 'ael-argument-role-of-failure',
        title: 'The Role of Failure — Argument',
        prompt: 'Take a position on what failure teaches.',
        frqType: 'argument',
        focusSkill: 'counterargument',
        difficulty: 'developing',
        sources: [],
      },
    ];

    function mockApEnglishLangAssignmentType() {
      getAvailableAssignmentTypesForScopes.mockResolvedValue([
        withOrganizationAssignment(
          makeAssignmentType({
            id: 'ap-english-lang-type',
            title: 'AP English Language Essay',
            systemKey: 'ap_english_lang_essay',
          })
        ),
      ]);
      prisma.apEnglishLangPromptLibraryEntry.findMany.mockResolvedValue(
        apEnglishLangEntries
      );
    }

    function loadLibrary(search = '') {
      return loader({
        request: new Request(
          `https://example.test/app/assignment-types/ap-english-lang-type${search}`
        ),
        params: { id: 'ap-english-lang-type' },
      } as never) as Promise<any>;
    }

    test('returns every entry plus facets when no filters are applied', async () => {
      mockApEnglishLangAssignmentType();

      const response = await loadLibrary();

      expect(response.data.apEnglishLangLibrary.totalCount).toBe(3);
      expect(
        response.data.apEnglishLangLibrary.entries.map(
          (entry: { externalKey: string }) => entry.externalKey
        )
      ).toEqual([
        'ael-synthesis-school-start-times',
        'ael-rhetorical-gettysburg',
        'ael-argument-role-of-failure',
      ]);
      expect(response.data.apEnglishLangLibrary.facets).toEqual({
        frqTypes: ['synthesis', 'rhetorical_analysis', 'argument'],
        focusSkills: [
          'counterargument',
          'rhetorical-situation',
          'source-integration',
        ],
        difficulties: ['developing', 'exam-ready'],
      });
      expect(
        response.data.apEnglishLangLibrary.optionCounts.frqTypes
      ).toEqual({
        synthesis: 1,
        rhetorical_analysis: 1,
        argument: 1,
      });
    });

    test('narrows entries by search term while keeping the full facet list', async () => {
      mockApEnglishLangAssignmentType();

      const response = await loadLibrary('?ael_q=Gettysburg');

      expect(
        response.data.apEnglishLangLibrary.entries.map(
          (entry: { externalKey: string }) => entry.externalKey
        )
      ).toEqual(['ael-rhetorical-gettysburg']);
      expect(response.data.apEnglishLangLibrary.totalCount).toBe(3);
      expect(response.data.apEnglishLangLibrary.facets.frqTypes).toEqual([
        'synthesis',
        'rhetorical_analysis',
        'argument',
      ]);
    });

    test('narrows entries by FRQ type and difficulty facets', async () => {
      mockApEnglishLangAssignmentType();

      const byType = await loadLibrary('?ael_frq=argument,synthesis');
      expect(
        byType.data.apEnglishLangLibrary.entries.map(
          (entry: { externalKey: string }) => entry.externalKey
        )
      ).toEqual([
        'ael-synthesis-school-start-times',
        'ael-argument-role-of-failure',
      ]);

      const byTypeAndDifficulty = await loadLibrary(
        '?ael_frq=argument,synthesis&ael_difficulty=developing'
      );
      expect(
        byTypeAndDifficulty.data.apEnglishLangLibrary.entries.map(
          (entry: { externalKey: string }) => entry.externalKey
        )
      ).toEqual(['ael-argument-role-of-failure']);
    });

    test('returns an empty entry list when nothing matches', async () => {
      mockApEnglishLangAssignmentType();

      const response = await loadLibrary('?ael_q=zzzznotaprompt');

      expect(response.data.apEnglishLangLibrary.entries).toEqual([]);
      expect(response.data.apEnglishLangLibrary.totalCount).toBe(3);
    });

    test('omits the AP English Language library when the teacher has no classes', async () => {
      mockApEnglishLangAssignmentType();
      prisma.class.findMany.mockResolvedValue([]);

      const response = await loadLibrary();

      expect(response.data.apEnglishLangLibrary).toBeNull();
      expect(
        prisma.apEnglishLangPromptLibraryEntry.findMany
      ).not.toHaveBeenCalled();
    });
  });
});
