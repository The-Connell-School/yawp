import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findMany: mock() },
  assignmentType: { findMany: mock() },
  class: { findMany: mock() },
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
  getAvailableAssignmentTypesForScopes,
}));
mock.module('~/utils/student-preview.server', () => ({
  getStudentPreviewState,
  studentPreviewModeKey: 'studentPreviewMode',
  studentPreviewOrgIdKey: 'studentPreviewOrgId',
  shouldUseStudentExperience: (args: {
    membershipRole: string;
    previewActive: boolean;
  }) => args.membershipRole === 'STUDENT' || args.previewActive,
}));
const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
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
    getAvailableAssignmentTypesForScopes.mockResolvedValue([]);
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
      organization: { id: 'org-1', name: 'Org' },
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

  test('fetches student dashboard assignments for all student classes', async () => {
    const response = await loader({
      request: new Request('https://example.test/app?tab=assignments'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentsEnabled).toBe(true);
    expect(prisma.classAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: { in: ['class-1', 'class-2'] } },
      })
    );
  });

  test('orders each student document tile by the current tutor module instead of the last module', async () => {
    const createdAt = new Date('2026-06-01T12:00:00.000Z');
    prisma.document.findMany.mockImplementation(async (args: any) => {
      if (args.where?.archivedAt?.not === null) return [];

      return [
        {
          id: 'doc-1',
          title: 'Essay Draft',
          html: '<p>Started</p>',
          text: 'Started',
          createdAt,
          updatedAt: createdAt,
          assignmentModuleSessions: [
            {
              id: 'cms-review',
              createdAt,
              updatedAt: createdAt,
              instructionsCompleted: 0,
              assignmentModuleId: 'module-review',
              assignmentModule: {
                id: 'module-review',
                position: 4,
                title: 'Review my Essay',
                instructions: [{ id: 'review-instruction' }],
              },
            },
            {
              id: 'cms-prewriting',
              createdAt,
              updatedAt: createdAt,
              instructionsCompleted: 0,
              assignmentModuleId: 'module-prewriting',
              assignmentModule: {
                id: 'module-prewriting',
                position: 1,
                title: 'Pre-Writing',
                instructions: [{ id: 'prewriting-instruction' }],
              },
            },
          ],
          submissions: [],
        },
      ];
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(
      data.documents[0].assignmentModuleSessions[0].assignmentModule.title
    ).toBe('Pre-Writing');
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

    expect(data.courses).toEqual([]);
    expect(data.teacherAssignmentTypes).toEqual([
      {
        id: 'type-1',
        title: 'Daily Pages',
        systemKey: null,
        image: { id: 'image-1' },
      },
    ]);
    expect(getAvailableAssignmentTypesForScopes).toHaveBeenCalledTimes(1);
    expect(prisma.assignmentType.findMany).not.toHaveBeenCalled();
    expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();
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
        name: 'Grade 9 • Period 1 — Pilot Class',
      },
    ]);
    expect(data.assignmentCreationTypes).toEqual([
      { id: 'type-1', title: 'Daily Pages' },
    ]);
  });
});
