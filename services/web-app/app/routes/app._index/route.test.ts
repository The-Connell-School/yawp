import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';

const ORIGINAL_COMPOSITION_FLAG = process.env.COMPOSITION_PRACTICE_ENABLED;

const prisma = {
  classAssignment: { findMany: mock() },
  assignmentType: { findMany: mock() },
  class: { findMany: mock(), findFirst: mock() },
  document: { findMany: mock(), count: mock() },
  orgMembership: { findUnique: mock() },
  teacherTraining: { findMany: mock() },
  submission: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const requireMutableRequest = mock();
const getTeacherClassCardStats = mock();
const getTeacherRecentActiveClassIds = mock();
const getAvailableAssignmentTypesForScopes = mock();
const getStudentPreviewState = mock();
const getStudentEnrolledClasses = mock();
const getAssignedPracticeForStudent = mock();
// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copy test-preload.ts captured
// before any file could mock.module() this path (see comment there).
const actualAssignmentTypeAccess =
  globalThis.__realModules['~/utils/assignment-type-access.server'];

mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  getAssignedPracticeForStudent,
  computeAssignedProgress: (
    attempts: Array<{ status: string; lessonSlug: string }>
  ) => ({
    attemptedCount: attempts.length,
    masteredCount: attempts.filter((a) => a.status === 'strong').length,
    doneCount: attempts.length,
  }),
}));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest,
  getSessionExpirationDate: () => new Date('2030-01-01T00:00:00.000Z'),
  sessionKey: 'sessionId',
}));
mock.module('~/utils/teacher-class-card-stats.server', () => ({
  getTeacherClassCardStats,
}));
mock.module('~/utils/teacher-dashboard-recent-classes.server', () => ({
  getTeacherRecentActiveClassIds,
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  ...actualAssignmentTypeAccess,
  getAvailableAssignmentTypesForScopes,
}));
mock.module('~/utils/student-classes.server', () => ({
  getStudentEnrolledClasses,
}));
const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/utils/assignment-type-access.server',
    () => actualAssignmentTypeAccess
  );
});

afterEach(() => {
  if (ORIGINAL_COMPOSITION_FLAG === undefined) {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  } else {
    process.env.COMPOSITION_PRACTICE_ENABLED = ORIGINAL_COMPOSITION_FLAG;
  }
});

describe('app index loader assignments', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockReset();
    requireMutableRequest.mockResolvedValue(undefined);
    getTeacherClassCardStats.mockReset();
    getTeacherRecentActiveClassIds.mockReset();
    getAvailableAssignmentTypesForScopes.mockReset();
    getStudentPreviewState.mockReset();
    getStudentPreviewState.mockResolvedValue({
      active: false,
      organizationId: null,
    });
    getAssignedPracticeForStudent.mockReset();
    getAssignedPracticeForStudent.mockResolvedValue([]);
    getAvailableAssignmentTypesForScopes.mockResolvedValue([]);
    getStudentEnrolledClasses.mockReset();
    getStudentEnrolledClasses.mockResolvedValue([]);
    getTeacherClassCardStats.mockResolvedValue({
      ungradedCount: 0,
      gradedUnreleasedCount: 0,
    });
    getTeacherRecentActiveClassIds.mockResolvedValue([]);

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'STUDENT',
      isOrgOwner: false,
      organization: {
        id: 'org-1',
        name: 'Org',
        writingPracticeEnabled: true,
      },
    });
    prisma.orgMembership.findUnique.mockResolvedValue({
      _count: { classesAsStudent: 2 },
    });
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
      {
        id: 'class-2',
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-2' }],
      },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.count.mockResolvedValue(0);
    prisma.teacherTraining.findMany.mockResolvedValue([]);
    prisma.classAssignment.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
  });

  test('does not load assignment types for the student dashboard', async () => {
    await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);

    expect(getAvailableAssignmentTypesForScopes).not.toHaveBeenCalled();
  });

  test('keeps a classless student on the dashboard and returns blocking class-code state', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      _count: { classesAsStudent: 0 },
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(response).not.toBeInstanceOf(Response);
    expect(data.requiresClassCode).toBe(true);
  });

  test('does not load documents or assignments for the student dashboard', async () => {
    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();
    expect(data).not.toHaveProperty('documents');
    expect(data).not.toHaveProperty('archivedDocuments');
    expect(data).not.toHaveProperty('assignments');
  });

  test('loads the classes a student is enrolled in for the dashboard Classes section', async () => {
    getStudentEnrolledClasses.mockResolvedValue([
      {
        id: 'class-1',
        grade: '9',
        period: '1',
        title: 'History',
        classArtKey: null,
        legacyClassArtIndex: null,
        school: { id: 'school-1', name: 'E2E High' },
        teacherNames: ['Mrs Test Teacher'],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(getStudentEnrolledClasses).toHaveBeenCalledWith(
      'profile-1',
      expect.any(String)
    );
    expect(data.enrolledClasses).toHaveLength(1);
    expect(data.enrolledClasses[0].id).toBe('class-1');
  });

  test('does not load writing practice state for the dashboard', async () => {
    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data).not.toHaveProperty(['writingPractice', 'Enabled'].join(''));
  });

  test('surfaces assigned writing practice on the student dashboard', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'true';
    getAssignedPracticeForStudent.mockResolvedValue([
      {
        id: 'wpca-1',
        assignment: {
          title: null,
          lessonSlugs: ['topic-sentences'],
          problemCount: 3,
          dueAt: new Date('2026-12-01T00:00:00Z'),
        },
        class: { id: 'class-1', grade: '10', period: '3', title: 'English 10' },
        attempts: [
          {
            promptId: 'topic-sentences-1',
            lessonSlug: 'topic-sentences',
            status: 'strong',
          },
        ],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app?tab=assignments'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.writingPracticeAssignments).toHaveLength(1);
    const practice = data.writingPracticeAssignments[0];
    expect(practice.id).toBe('wpca-1');
    // Untitled assignment shows the assigned lesson's name.
    expect(practice.title).toBe('Topic Sentences');
    expect(practice.hasComposition).toBe(true);
    expect(practice.masteredCount).toBe(1);
    expect(practice.classLabel.title).toBe('English 10');
  });

  test('hides Composition assignments while their rollout flag is off', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
    getAssignedPracticeForStudent.mockResolvedValue([
      {
        id: 'grammar-assignment',
        assignment: {
          title: 'Comma splices',
          lessonSlugs: ['fixing-comma-splices'],
          problemCount: 3,
          dueAt: null,
        },
        class: { id: 'class-1', grade: '10', period: '3', title: 'English 10' },
        attempts: [],
      },
      {
        id: 'composition-assignment',
        assignment: {
          title: 'Topic sentences',
          lessonSlugs: ['topic-sentences'],
          problemCount: 3,
          dueAt: null,
        },
        class: { id: 'class-1', grade: '10', period: '3', title: 'English 10' },
        attempts: [],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(
      data.writingPracticeAssignments.map(
        (assignment: { id: string }) => assignment.id
      )
    ).toEqual(['grammar-assignment']);
  });

  test('does not load assigned writing practice while the organization flag is off', async () => {
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'STUDENT',
      isOrgOwner: false,
      organization: {
        id: 'org-1',
        name: 'Org',
        writingPracticeEnabled: false,
      },
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(getAssignedPracticeForStudent).not.toHaveBeenCalled();
    expect(data.writingPracticeAssignments).toEqual([]);
  });

  test('keeps all teacher classes navigable while scoping assignment data to available classes', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-profile-1',
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { id: 'org-1', name: 'Org' },
    });
    getTeacherRecentActiveClassIds.mockResolvedValue(['class-1', 'class-2']);
    prisma.class.findMany.mockImplementation(async (args: any) => {
      if (args.select?._count) {
        return [
          {
            id: 'class-1',
            grade: '9',
            period: '1',
            title: 'First Class',
            classArtKey: 'van-gogh-wheat-field-cypresses::center-0pct',
            classArtIndex: 12,
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 2 },
          },
          {
            id: 'class-2',
            grade: '9',
            period: '2',
            title: 'Second Class',
            classArtKey: 'af-klint-ten-largest-youth::center-10pct',
            classArtIndex: 3,
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 0 },
          },
        ];
      }

      return [
        {
          id: 'class-1',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
        {
          id: 'class-2',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
      ];
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentsEnabled).toBe(true);
    expect(
      data.teacherClasses.map((klass: { id: string }) => klass.id)
    ).toEqual(['class-1', 'class-2']);
    expect(data.totalTeacherClassCount).toBe(2);
    expect(getTeacherRecentActiveClassIds).toHaveBeenCalledWith({
      teacherClassIds: ['class-1', 'class-2'],
    });
    expect(data.teacherClassCards).toHaveLength(2);
    expect(data.teacherClassCards[0]).toMatchObject({
      id: 'class-1',
      title: 'First Class',
      classArtKey: 'van-gogh-wheat-field-cypresses::center-0pct',
      legacyClassArtIndex: 12,
    });
    expect(data.teacherClassCards[1]).toMatchObject({
      id: 'class-2',
      title: 'Second Class',
      classArtKey: 'af-klint-ten-largest-youth::center-10pct',
      legacyClassArtIndex: 3,
    });
    expect(getTeacherClassCardStats).toHaveBeenCalledTimes(2);
  });

  test('sorts recently active classes first on the dashboard preview', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-profile-1',
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { id: 'org-1', name: 'Org' },
    });
    getTeacherRecentActiveClassIds.mockResolvedValue([
      'class-active-1',
      'class-active-2',
    ]);
    prisma.class.findMany.mockImplementation(async (args: any) => {
      if (args.select?._count) {
        return [
          {
            id: 'class-active-1',
            grade: '9',
            period: '1',
            title: 'Active One',
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 1 },
          },
          {
            id: 'class-active-2',
            grade: '9',
            period: '2',
            title: 'Active Two',
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 1 },
          },
          {
            id: 'class-quiet',
            grade: '10',
            period: '1',
            title: 'Quiet Class',
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 0 },
          },
        ];
      }

      return [
        {
          id: 'class-active-1',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
        {
          id: 'class-active-2',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
        {
          id: 'class-quiet',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
      ];
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.totalTeacherClassCount).toBe(3);
    expect(
      data.teacherClassCards.map((klass: { id: string }) => klass.id)
    ).toEqual(['class-active-1', 'class-active-2', 'class-quiet']);
    expect(data.teacherWorkspaceClassStats).toHaveLength(3);
  });

  test('shows at most six classes on the dashboard while keeping the full count', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-profile-1',
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { id: 'org-1', name: 'Org' },
    });
    getTeacherRecentActiveClassIds.mockResolvedValue([]);
    const classRows = Array.from({ length: 8 }, (_, index) => ({
      id: `class-${index + 1}`,
      grade: '9',
      period: String(index + 1),
      title: `Class ${index + 1}`,
      school: {
        id: 'school-1',
        name: 'Parker High School',
        organizationId: 'org-1',
      },
      _count: { students: 1, teachers: 1, classAssignments: 0 },
    }));
    prisma.class.findMany.mockImplementation(async (args: any) => {
      if (args.select?._count) {
        return classRows;
      }

      return classRows.map((klass) => ({
        id: klass.id,
        school: {
          id: klass.school.id,
          organizationId: klass.school.organizationId,
        },
      }));
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.totalTeacherClassCount).toBe(8);
    expect(data.teacherClassCards).toHaveLength(6);
    expect(data.teacherClasses).toHaveLength(8);
  });

  test('shows all teacher classes when none have recent document activity', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-profile-1',
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { id: 'org-1', name: 'Org' },
    });
    getTeacherRecentActiveClassIds.mockResolvedValue([]);
    prisma.class.findMany.mockImplementation(async (args: any) => {
      if (args.select?._count) {
        return [
          {
            id: 'class-quiet',
            grade: '10',
            period: '1',
            title: 'Quiet Class',
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 0 },
          },
        ];
      }

      return [
        {
          id: 'class-quiet',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
      ];
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.totalTeacherClassCount).toBe(1);
    expect(data.teacherClassCards).toHaveLength(1);
    expect(data.teacherClassCards[0]).toMatchObject({
      id: 'class-quiet',
      title: 'Quiet Class',
    });
  });

  test('loads available assignment types for teachers when assignments are enabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-profile-1',
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { id: 'org-1', name: 'Org' },
    });
    getTeacherRecentActiveClassIds.mockResolvedValue(['class-1']);
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      {
        id: 'type-1',
        title: 'Daily Pages',
        systemKey: null,
        image: { id: 'image-1' },
      },
    ]);
    prisma.class.findMany.mockImplementation(async (args: any) => {
      if (args.select?._count) {
        return [
          {
            id: 'class-1',
            grade: '9',
            period: '1',
            title: 'Pilot Class',
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 1 },
          },
        ];
      }

      return [
        {
          id: 'class-1',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
      ];
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.teacherAssignmentTypes).toEqual([
      {
        id: 'type-1',
        title: 'Daily Pages',
        systemKey: null,
        image: { id: 'image-1' },
      },
    ]);
    expect(getAvailableAssignmentTypesForScopes).toHaveBeenCalledTimes(1);
    expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();

    // Which types a teacher can see still comes only from the scoped helper.
    // Reading grading config for them is allowed, but every such read has to be
    // confined to ids that helper already returned — an unconstrained findMany
    // here is how types from outside the teacher's scope would leak in.
    for (const call of prisma.assignmentType.findMany.mock.calls) {
      const ids = call[0]?.where?.id?.in;
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.every((id: string) => id === 'type-1')).toBe(true);
    }
  });

  test('loads assignment creation sheet data for teachers when assignments are enabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-profile-1',
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { id: 'org-1', name: 'Org' },
    });
    getTeacherRecentActiveClassIds.mockResolvedValue(['class-1']);
    getAvailableAssignmentTypesForScopes.mockResolvedValue([
      {
        id: 'type-1',
        title: 'Daily Pages',
        systemKey: null,
        image: { id: 'image-1' },
      },
      {
        id: 'type-ap',
        title: 'AP History',
        systemKey: 'ap_history_essay',
        image: null,
      },
    ]);
    prisma.class.findMany.mockImplementation(async (args: any) => {
      if (args.select?._count) {
        return [
          {
            id: 'class-1',
            grade: '9',
            period: '1',
            title: 'Pilot Class',
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, classAssignments: 1 },
          },
        ];
      }

      return [
        {
          id: 'class-1',
          school: { id: 'school-1', organizationId: 'org-1' },
        },
      ];
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentCreationClasses).toEqual([
      {
        id: 'class-1',
        name: 'Pilot Class · Grade 9 • Period 1',
      },
    ]);
    expect(data.assignmentCreationTypes).toEqual([
      // Defaulted rather than omitted: the sheet reads this to decide whether to
      // offer collaborative drafts, and an absent flag would read as supported
      // nowhere but be indistinguishable from a select that forgot to ask.
      {
        id: 'type-1',
        title: 'Daily Pages',
        collaborationSupported: false,
        // Same reasoning: the sheet reads this to decide whether to offer the
        // grammar-grading toggle, and the mocked type has no rubric to grade
        // grammar with.
        gradesGrammar: false,
        // The mocked type has no kind, so no writing time is suggested.
        defaultWritingTimeMinutes: null,
        offersParagraphModes: false,
      },
    ]);
  });
});
