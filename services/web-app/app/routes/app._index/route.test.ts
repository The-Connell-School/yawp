import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignment: { findMany: mock() },
  assignmentType: { findMany: mock() },
  class: { findMany: mock() },
  document: { findMany: mock(), count: mock() },
  featureAccessTarget: { findMany: mock() },
  studentProfile: { findMany: mock() },
  teacherProfile: { findUnique: mock() },
  teacherTraining: { findMany: mock() },
  submission: { findMany: mock() },
};

const requireUserId = mock();
const requireProfile = mock();
const getAssignmentsEnabledClassIdsForContext = mock();
const getAssignmentCreationStandardizationEnabledClassIdsForContext = mock();
const getTeacherClassCardStats = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/feature-flags.server', () => ({
  getAssignmentCreationStandardizationEnabledClassIdsForContext,
  getAssignmentsEnabledClassIdsForContext,
}));
mock.module('~/utils/teacher-class-card-stats.server', () => ({
  getTeacherClassCardStats,
}));

const { loader } = await import('./route');

describe('app index loader assignments', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    requireProfile.mockReset();
    getAssignmentsEnabledClassIdsForContext.mockReset();
    getAssignmentCreationStandardizationEnabledClassIdsForContext.mockReset();
    getTeacherClassCardStats.mockReset();
    getTeacherClassCardStats.mockResolvedValue({
      ungradedCount: 0,
      gradedUnreleasedCount: 0,
    });

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      isOwner: false,
      organization: { id: 'org-1' },
      teacherProfile: null,
      studentProfile: {
        id: 'student-profile-1',
        classes: [{ id: 'class-1' }, { id: 'class-2' }],
      },
    });
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        school: { organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }],
      },
      {
        id: 'class-2',
        school: { organizationId: 'org-1' },
        teachers: [{ id: 'teacher-2' }],
      },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.count.mockResolvedValue(0);
    prisma.studentProfile.findMany.mockResolvedValue([]);
    prisma.teacherProfile.findUnique.mockResolvedValue({
      _count: { assignedTeacherTrainings: 0 },
      schools: [],
    });
    prisma.teacherTraining.findMany.mockResolvedValue([]);
    prisma.assignment.findMany.mockResolvedValue([]);
    prisma.submission.findMany.mockResolvedValue([]);
    getAssignmentCreationStandardizationEnabledClassIdsForContext.mockResolvedValue(
      []
    );
  });

  test('fetches student dashboard assignments only for enabled pilot classes', async () => {
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue(['class-1']);

    const response = await loader({
      request: new Request('https://example.test/app?tab=assignments'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentsEnabled).toBe(true);
    expect(getAssignmentsEnabledClassIdsForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      classes: [
        {
          id: 'class-1',
          organizationId: 'org-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          id: 'class-2',
          organizationId: 'org-1',
          teacherProfileIds: ['teacher-2'],
        },
      ],
    });
    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: { in: ['class-1'] } },
      })
    );
  });

  test('keeps all teacher classes navigable while scoping assignment data to enabled pilot classes', async () => {
    requireProfile.mockResolvedValue({
      id: 'teacher-profile-wrapper-1',
      isOwner: false,
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-profile-1' },
      studentProfile: null,
    });
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue(['class-1']);
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
            _count: { students: 1, teachers: 1, assignments: 2 },
          },
          {
            id: 'class-2',
            grade: '9',
            period: '2',
            title: 'Non-Pilot Class',
            school: {
              id: 'school-1',
              name: 'Parker High School',
              organizationId: 'org-1',
            },
            _count: { students: 1, teachers: 1, assignments: 0 },
          },
        ];
      }

      return [
        { id: 'class-1', school: { organizationId: 'org-1' } },
        { id: 'class-2', school: { organizationId: 'org-1' } },
      ];
    });

    const response = await loader({
      request: new Request('https://example.test/app'),
      params: {},
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentsEnabled).toBe(true);
    expect(getAssignmentsEnabledClassIdsForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-profile-1',
      classes: [
        { id: 'class-1', organizationId: 'org-1' },
        { id: 'class-2', organizationId: 'org-1' },
      ],
    });
    expect(
      data.teacherClasses.map((klass: { id: string }) => klass.id)
    ).toEqual(['class-1', 'class-2']);
    expect(data.teacherClassCards).toHaveLength(2);
    expect(data.teacherClassCards[0]).toMatchObject({
      id: 'class-1',
      title: 'Pilot Class',
    });
    expect(data.teacherClassCards[1]).toMatchObject({
      id: 'class-2',
      title: 'Non-Pilot Class',
    });
    expect(getTeacherClassCardStats).toHaveBeenCalledTimes(2);
  });

  test('skips the assignment-type catalog fetch for teachers', async () => {
    requireProfile.mockResolvedValue({
      id: 'teacher-profile-wrapper-1',
      isOwner: false,
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-profile-1' },
      studentProfile: null,
    });
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue(['class-1']);
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
            _count: { students: 1, teachers: 1, assignments: 1 },
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

    // The dashboard no longer renders assignment types or assignment lists for
    // teachers; that workflow lives on /app/assignments.
    expect(data.courses).toEqual([]);
    expect(prisma.assignmentType.findMany).not.toHaveBeenCalled();
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
  });

});
