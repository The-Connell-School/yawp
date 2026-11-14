import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findFirst: mock(),
    findMany: mock(),
    // The loader resolves the type's grading config to report its default
    // total points; without this the whole file dies on the first loader call.
    findUnique: mock(),
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
  savedThesisPrompt: {
    findMany: mock(),
  },
  savedDailyPagesPrompt: {
    findMany: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const createDocumentForAssignmentType = mock();
const redirectWithToast = mock();
const getAvailableAssignmentTypesForScopes = mock();
const isAssignmentTypeAvailableForAnyScope = mock();
const isTeacherPromptGeneratorEnabled = mock(async () => true);
const getAssignmentTypeLandingFlags = mock(async () => ({
  v2: false,
  thesisEssay: false,
  lessonPlans: false,
}));
const isHowToTeachItEnabled = mock(async () => true);

// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copy test-preload.ts captured
// before any file could mock.module() this path (see comment there).
const assignmentTypeAccessActual =
  globalThis.__realModules['~/utils/assignment-type-access.server'];

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
  AssignmentTypeAccessScope: undefined,
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForAnyScope,
}));
mock.module('~/domain/teacher-prompt-generator/gate.server', () => ({
  isTeacherPromptGeneratorEnabled,
}));
mock.module('~/domain/assignment-types/landing-page-gate.server', () => ({
  getAssignmentTypeLandingFlags,
}));
const findThesisEssayCourse = mock<() => Promise<{ courseId: string; coursePath: string; videoModules: Record<number, string> } | null>>(async () => null);
mock.module('~/domain/teacher-trainings/thesis-essay-course.server', () => ({
  findThesisEssayCourse,
  // The real helper, as bun's module mock replaces the whole module.
  tutorialHrefs: (assignmentTypeId: string, course: { videoModules: Record<number, string> } | null) =>
    Object.fromEntries(
      Object.keys(course?.videoModules ?? {}).map((n) => [n, `/app/assignment-types/${assignmentTypeId}/tutorial/${n}`])
    ),
}));
const redirectLockedPreviewAssignmentTypeHomeToGuide = mock(async () => {});
mock.module(
  '~/domain/free-tier/locked-preview-assignment-type-routing.server',
  () => ({
    redirectLockedPreviewAssignmentTypeHomeToGuide,
  })
);
mock.module('~/domain/assignment-types/how-to-teach-it.server', () => ({
  isHowToTeachItEnabled,
}));

const { action, loader, showModulesAccordion } = await import('./route');

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
    prisma.assignmentType.findUnique.mockReset();
    // The loader also reads grading config for this type, to decide whether the
    // creation sheet offers the grammar-grading toggle. No rubric here, so the
    // default resolves to no toggle.
    prisma.assignmentType.findMany.mockResolvedValue([]);
    // And reads the row itself for the default total points. A row with no
    // rubric of its own falls back to the default for its kind.
    prisma.assignmentType.findUnique.mockResolvedValue(null);
    prisma.class.findMany.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.savedThesisPrompt.findMany.mockReset();
    prisma.savedThesisPrompt.findMany.mockResolvedValue([]);
    requireUserId.mockReset();
    requireMembership.mockReset();
    createDocumentForAssignmentType.mockReset();
    redirectWithToast.mockReset();
    isAssignmentTypeAvailableForAnyScope.mockReset();
    redirectLockedPreviewAssignmentTypeHomeToGuide.mockReset();
    redirectLockedPreviewAssignmentTypeHomeToGuide.mockResolvedValue(undefined);

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

  test('rejects direct document creation for students', async () => {
    const response = await action({
      request: new Request('https://example.test/app/assignment-types/at-1', {
        method: 'POST',
      }),
      params: { id: 'at-1' },
    } as never);

    expect(response as unknown).toEqual({
      redirectedTo: '/app',
      toast: {
        type: 'error',
        description: 'Start writing from an assignment in one of your classes.',
      },
    });
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });

  test('requires assignment type availability before creating a document', async () => {
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
    });

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
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
    });
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

describe('app.assignment-types.$id loader Class Starter prompt library', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    // The loader also reads grading config for this type, to decide whether the
    // creation sheet offers the grammar-grading toggle. No rubric here, so the
    // default resolves to no toggle.
    prisma.assignmentType.findMany.mockResolvedValue([]);
    // And reads the row itself for the default total points. A row with no
    // rubric of its own falls back to the default for its kind.
    prisma.assignmentType.findUnique.mockResolvedValue(null);
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
      withOrganizationAssignment(makeAssignmentType({ title: 'Class Starter' })),
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
    prisma.savedDailyPagesPrompt.findMany.mockReset();
    prisma.savedDailyPagesPrompt.findMany.mockResolvedValue([]);
  });

  test('hides the modules list on Class Starter (single module)', () => {
    expect(showModulesAccordion({ kind: 'class_starter' }, 1)).toBe(false);
  });

  test('hides the modules list on an exit ticket', () => {
    // The exit ticket has one module whose whole description is "answer the
    // exit ticket in your own words". The directions above it already say
    // that, so the accordion is noise on this page only.
    expect(showModulesAccordion({ kind: 'exit_ticket' }, 1)).toBe(false);
    expect(showModulesAccordion({ kind: null }, 1)).toBe(true);
  });

  test('hides the modules list on an exit ticket for students too', () => {
    // Not gated on role: the row is equally uninformative either way.
    expect(showModulesAccordion({ kind: 'exit_ticket' }, 3)).toBe(false);
  });

  test('still hides the modules list when there are no modules at all', () => {
    expect(showModulesAccordion({ kind: null }, 0)).toBe(false);
  });

  test('teachers get How to Teach It, with only safe module links', async () => {
    isHowToTeachItEnabled.mockClear();
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({
          title: 'The Thesis-Driven Essay',
          assignmentModules: [
            {
              id: 'module-1',
              title: 'Pre-Writing',
              description: 'Students brainstorm.',
              lessonUrl: '/app/lesson-planner/library',
              tutorialVideoUrl: 'javascript:alert(1)',
            },
          ],
        })
      ),
    ]);

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(isHowToTeachItEnabled).toHaveBeenCalledWith('org-1');
    expect(response.data.howToTeachItEnabled).toBe(true);
    expect(response.data.assignmentType.assignmentModules[0]).toMatchObject({
      lessonUrl: '/app/lesson-planner/library',
      tutorialVideoUrl: null,
    });
  });

  test('students never get How to Teach It and skip the flag read', async () => {
    isHowToTeachItEnabled.mockClear();
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(isHowToTeachItEnabled).not.toHaveBeenCalled();
    expect(response.data.howToTeachItEnabled).toBe(false);
  });

  test('provides prompt library data for teachers viewing Class Starter', async () => {
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
    // "My prompts" is offered even before the teacher has saved anything.
    expect(response.data.promptLibrary.facets.collections).toEqual([
      'library',
      'mine',
    ]);
    expect(response.data.promptLibrary.optionCounts.collections).toEqual({
      library: 200,
      mine: 0,
    });
  });

  test('merges the teacher\'s saved prompts into the library as "My prompts"', async () => {
    prisma.savedDailyPagesPrompt.findMany.mockResolvedValue([
      {
        id: 'saved-1',
        prompt: 'You become who you spend time with. Defend or reject this.',
        facets: {
          type: 'agree-disagree',
          seriousness: 'moderate',
          cognitiveMoves: ['take-a-stance'],
        },
        createdAt: new Date('2026-07-28T12:00:00.000Z'),
      },
    ]);

    const response = (await loader({
      request: new Request(
        'https://example.test/app/assignment-types/at-1?lp_coll=mine'
      ),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(
      prisma.savedDailyPagesPrompt.findMany.mock.calls[0][0].where
    ).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      archivedAt: null,
    });
    // The saved prompt is the only thing the "My prompts" filter keeps.
    expect(response.data.promptLibrary.prompts).toHaveLength(1);
    expect(response.data.promptLibrary.prompts[0]).toMatchObject({
      id: 'saved-1',
      collection: 'mine',
      type: 'agree-disagree',
      seriousness: 'moderate',
      cognitiveMoves: ['take-a-stance'],
      savedAt: '2026-07-28T12:00:00.000Z',
    });
    expect(response.data.promptLibrary.totalCount).toBe(201);
    expect(response.data.promptLibrary.optionCounts.collections.mine).toBe(1);
  });

  test('omits saved prompts for students and other assignment types', async () => {
    requireMembership.mockResolvedValueOnce({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });

    const studentResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(studentResponse.data.promptLibrary).toBeNull();
    expect(prisma.savedDailyPagesPrompt.findMany).not.toHaveBeenCalled();

    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(makeAssignmentType({ title: 'E2E Course' })),
    ]);

    const otherTypeResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(otherTypeResponse.data.promptLibrary).toBeNull();
    expect(prisma.savedDailyPagesPrompt.findMany).not.toHaveBeenCalled();
  });

  test('provides thesis prompt library for teachers viewing The Thesis-Driven Essay', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({ title: 'The Thesis-Driven Essay' })
      ),
    ]);

    const response = (await loader({
      request: new Request(
        'https://example.test/app/assignment-types/at-1?tp_cat=single-text'
      ),
      params: { id: 'at-1' },
    } as never)) as any;

    // Daily Pages library stays null for this assignment type.
    expect(response.data.promptLibrary).toBeNull();
    expect(response.data.thesisPromptLibrary.totalCount).toBeGreaterThan(0);
    expect(
      response.data.thesisPromptLibrary.prompts.every(
        (p: { category: string }) => p.category === 'single-text'
      )
    ).toBe(true);
    expect(response.data.thesisPromptLibrary.facets.categories).toContain(
      'general'
    );
  });

  test('merges the teacher\'s saved prompts into the thesis library as "My prompts"', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(
        makeAssignmentType({ title: 'The Thesis-Driven Essay' })
      ),
    ]);
    prisma.savedThesisPrompt.findMany.mockResolvedValue([
      {
        id: 'saved-1',
        title: 'Loyalty Under Pressure',
        prompt: 'Write a thesis-driven critical essay on loyalty.',
        createdAt: new Date('2026-07-27T12:00:00.000Z'),
      },
    ]);

    const response = (await loader({
      request: new Request(
        'https://example.test/app/assignment-types/at-1?tp_coll=mine'
      ),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(prisma.savedThesisPrompt.findMany.mock.calls[0][0].where).toEqual({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      archivedAt: null,
    });
    // The saved prompt is the only thing the "My prompts" filter keeps.
    expect(response.data.thesisPromptLibrary.prompts).toHaveLength(1);
    expect(response.data.thesisPromptLibrary.prompts[0]).toMatchObject({
      id: 'saved-1',
      title: 'Loyalty Under Pressure',
      collection: 'mine',
    });
    expect(response.data.thesisPromptLibrary.facets.collections).toEqual([
      'library',
      'mine',
    ]);
    expect(
      response.data.thesisPromptLibrary.optionCounts.collections.mine
    ).toBe(1);
  });

  test('omits thesis prompt library for students and other assignment types', async () => {
    requireMembership.mockResolvedValueOnce({
      id: 'profile-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });
    getAvailableAssignmentTypesForScopes.mockResolvedValueOnce([
      withOrganizationAssignment(
        makeAssignmentType({ title: 'The Thesis-Driven Essay' })
      ),
    ]);

    const studentResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;
    expect(studentResponse.data.thesisPromptLibrary).toBeNull();

    getAvailableAssignmentTypesForScopes.mockResolvedValueOnce([
      withOrganizationAssignment(makeAssignmentType({ title: 'Daily Pages' })),
    ]);
    const dailyPagesResponse = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;
    expect(dailyPagesResponse.data.thesisPromptLibrary).toBeNull();
    // Daily Pages reads the graded short-form corpus, not the freewrite one
    // this folder holds — that swap is the point of having two libraries.
    expect(dailyPagesResponse.data.promptLibrary).toBeNull();
    expect(dailyPagesResponse.data.shortFormPromptLibrary).not.toBeNull();
  });

  test('Daily Pages gets the short-form library and Class Starter the freewrite one', async () => {
    getAvailableAssignmentTypesForScopes.mockResolvedValueOnce([
      withOrganizationAssignment(makeAssignmentType({ title: 'Daily Pages' })),
    ]);
    const dailyPages = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(dailyPages.data.shortFormPromptLibrary.totalCount).toBeGreaterThan(0);
    expect(
      dailyPages.data.shortFormPromptLibrary.facets.sourceNeeds
    ).toContain('required');
    expect(dailyPages.data.promptLibrary).toBeNull();

    getAvailableAssignmentTypesForScopes.mockResolvedValueOnce([
      withOrganizationAssignment(makeAssignmentType({ title: 'Class Starter' })),
    ]);
    const classStarter = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    expect(classStarter.data.promptLibrary.totalCount).toBe(200);
    expect(classStarter.data.shortFormPromptLibrary).toBeNull();
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

  test('strips unreleased grade fields from document submission summaries', async () => {
    requireMembership.mockResolvedValueOnce({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });
    prisma.document.findMany.mockImplementation(async (args: any) => {
      if (args.where?.archivedAt?.not) {
        return [];
      }
      return [
        {
          id: 'doc-1',
          assignmentModuleSessions: [],
          submissions: [
            {
              id: 'sub-1',
              score: '80% (B)',
              overallScore: 85,
              numericPercentage: 80,
              letterGrade: 'B',
              releasedAt: null,
              submittedAt: new Date('2026-08-01T00:00:00.000Z'),
            },
            {
              id: 'sub-2',
              score: '90% (A)',
              overallScore: 20,
              numericPercentage: 90,
              letterGrade: 'A',
              releasedAt: new Date('2026-08-02T00:00:00.000Z'),
              submittedAt: new Date('2026-08-03T00:00:00.000Z'),
            },
          ],
        },
      ];
    });

    const response = (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;

    const submissions = response.data.documents[0].submissions;
    expect(submissions[0]).toEqual({
      id: 'sub-1',
      releasedAt: null,
      submittedAt: submissions[0].submittedAt,
    });
    expect(submissions[0]).not.toHaveProperty('overallScore');
    expect(submissions[0]).not.toHaveProperty('numericPercentage');
    expect(submissions[0]).not.toHaveProperty('score');
    expect(submissions[1].numericPercentage).toBe(90);
    expect(submissions[1].overallScore).toBe(20);
    expect(JSON.stringify(response.data)).not.toContain('80% (B)');
    expect(JSON.stringify(response.data)).not.toMatch(/overallScore["\\]*,85\b/);
  });
});

describe('app.assignment-types.$id loader landing page', () => {
  const teacher = {
    id: 'teacher-1',
    role: 'TEACHER',
    organization: { id: 'org-1', name: 'Org' },
  };

  beforeEach(() => {
    prisma.assignmentType.findMany.mockReset().mockResolvedValue([]);
    prisma.assignmentType.findUnique.mockReset().mockResolvedValue(null);
    prisma.document.findMany.mockReset().mockResolvedValue([]);
    prisma.class.findMany.mockReset().mockResolvedValue([
      {
        id: 'class-1',
        grade: '9th',
        period: '1st',
        title: null,
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
    ]);
    prisma.savedThesisPrompt.findMany.mockReset().mockResolvedValue([]);
    prisma.savedDailyPagesPrompt.findMany.mockReset().mockResolvedValue([]);
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue(teacher);
    getAssignmentTypeLandingFlags.mockReset();
    getAvailableAssignmentTypesForScopes.mockReset();
  });

  async function load(type: Record<string, unknown>) {
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      withOrganizationAssignment(makeAssignmentType(type)),
    ]);
    return (await loader({
      request: new Request('https://example.test/app/assignment-types/at-1'),
      params: { id: 'at-1' },
    } as never)) as any;
  }

  test('keeps the old page while the flag is off', async () => {
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: false, thesisEssay: false, lessonPlans: false });
    const response = await load({ title: 'Class Starter' });
    expect(response.data.landingPageKey).toBeNull();
    expect(getAssignmentTypeLandingFlags).toHaveBeenCalledWith('org-1');
  });

  test("gives teachers Brian's page when the flag is on", async () => {
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: true, thesisEssay: false, lessonPlans: false });
    expect((await load({ title: 'Class Starter' })).data.landingPageKey).toBe(
      'class-starter'
    );
    expect(
      (await load({ title: 'Exit Ticket', kind: 'exit_ticket' })).data.landingPageKey
    ).toBe('exit-ticket');
  });

  test('keeps the old Thesis-Driven Essay page until its own flag is on', async () => {
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: true, thesisEssay: false, lessonPlans: false });
    expect(
      (await load({ title: 'The Thesis-Driven Essay' })).data.landingPageKey
    ).toBeNull();
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: true, thesisEssay: true, lessonPlans: false });
    expect(
      (await load({ title: 'The Thesis-Driven Essay' })).data.landingPageKey
    ).toBe('thesis-driven-essay');
  });

  test('students and school-authored types keep the old page', async () => {
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: true, thesisEssay: true, lessonPlans: false });
    expect(
      (await load({ title: "GBA 300: Int'l Expansion Plan" })).data.landingPageKey
    ).toBeNull();
    requireMembership.mockResolvedValue({ ...teacher, role: 'STUDENT' });
    prisma.class.findMany.mockResolvedValue([]);
    expect((await load({ title: 'Class Starter' })).data.landingPageKey).toBeNull();
    expect(getAssignmentTypeLandingFlags).toHaveBeenCalledTimes(1);
  });

  test('Pre-Writing reuses the Thesis-Driven Essay library on the new page only', async () => {
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: false, thesisEssay: false, lessonPlans: false });
    const before = await load({ title: 'Prewriting', kind: 'prewriting' });
    expect(before.data.thesisPromptLibrary).toBeNull();

    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: true, thesisEssay: false, lessonPlans: false });
    const after = await load({ title: 'Prewriting', kind: 'prewriting' });
    expect(after.data.landingPageKey).toBe('prewriting');
    expect(after.data.thesisPromptLibrary.totalCount).toBeGreaterThanOrEqual(100);
  });

  test('hands the page each lesson’s tutorial video from the Lounge course (Brian, Nov 6)', async () => {
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: true, thesisEssay: true, lessonPlans: false });
    findThesisEssayCourse.mockResolvedValue({
      courseId: 'course-1',
      coursePath: '/app/teacher-trainings/course-1',
      videoModules: { 2: 'm7' },
    });
    // Played on this type's own tutorial page, never a link into the Lounge.
    expect((await load({ title: 'The Thesis-Driven Essay' })).data.landingVideos).toEqual({
      2: '/app/assignment-types/at-1/tutorial/2',
    });
    expect(findThesisEssayCourse).toHaveBeenCalledWith('teacher-1');
    // No course this teacher can open: no video links, and the page still renders.
    findThesisEssayCourse.mockResolvedValue(null);
    expect((await load({ title: 'Prewriting', kind: 'prewriting' })).data.landingVideos).toEqual({});
    // The old page never looks.
    findThesisEssayCourse.mockClear();
    expect((await load({ title: "GBA 300: Int'l Expansion Plan" })).data.landingVideos).toEqual({});
    expect(findThesisEssayCourse).not.toHaveBeenCalled();
  });

  test('Thesis Statement gets no library', async () => {
    getAssignmentTypeLandingFlags.mockResolvedValue({ v2: true, thesisEssay: false, lessonPlans: false });
    const response = await load({ title: 'Thesis Statement', kind: 'thesis_statement' });
    expect(response.data.landingPageKey).toBe('thesis-statement');
    expect(response.data.thesisPromptLibrary).toBeNull();
    expect(response.data.promptLibrary).toBeNull();
  });
});
