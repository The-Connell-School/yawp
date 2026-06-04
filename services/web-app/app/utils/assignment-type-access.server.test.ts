import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findFirst: mock(),
    findMany: mock(),
  },
  featureAccessTarget: {
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  getAssignmentTypeAccessFeatureKey,
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForAnyScope,
  isAssignmentTypeAvailableForEveryScope,
} = await import('./assignment-type-access.server');

describe('assignment type access resolution', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.featureAccessTarget.findMany.mockReset();
  });

  test('uses the assignment type feature key prefix', () => {
    expect(getAssignmentTypeAccessFeatureKey('daily-pages')).toBe(
      'assignment_type:daily-pages'
    );
  });

  test('teacher overrides take precedence over school and organization defaults', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      organizationAssignments: [{ organizationId: 'org-1' }],
    });
    prisma.featureAccessTarget.findMany.mockResolvedValue([
      {
        featureKey: 'assignment_type:at-1',
        targetKind: 'organization',
        targetId: 'org-1',
        enabled: true,
      },
      {
        featureKey: 'assignment_type:at-1',
        targetKind: 'school',
        targetId: 'school-1',
        enabled: true,
      },
      {
        featureKey: 'assignment_type:at-1',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: false,
      },
    ]);

    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-1',
        scopes: [
          {
            organizationId: 'org-1',
            schoolId: 'school-1',
            teacherProfileId: 'teacher-1',
          },
        ],
      })
    ).resolves.toBe(false);

    expect(prisma.featureAccessTarget.findMany).toHaveBeenCalledWith({
      where: {
        featureKey: { in: ['assignment_type:at-1'] },
        targetKind: { in: ['teacher', 'school', 'organization'] },
        targetId: { in: ['org-1', 'school-1', 'teacher-1'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: {
        featureKey: true,
        targetKind: true,
        targetId: true,
        enabled: true,
      },
    });
  });

  test('school overrides can expose org-hidden assignment types when no teacher override exists', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      organizationAssignments: [],
    });
    prisma.featureAccessTarget.findMany.mockResolvedValue([
      {
        featureKey: 'assignment_type:at-1',
        targetKind: 'school',
        targetId: 'school-1',
        enabled: true,
      },
      {
        featureKey: 'assignment_type:at-1',
        targetKind: 'organization',
        targetId: 'org-1',
        enabled: false,
      },
    ]);

    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-1',
        scopes: [
          {
            organizationId: 'org-1',
            schoolId: 'school-1',
            teacherProfileId: 'teacher-1',
          },
        ],
      })
    ).resolves.toBe(true);
  });

  test('every scope requires each selected class scope to have access', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      organizationAssignments: [{ organizationId: 'org-1' }],
    });
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);

    const scopes = [
      { organizationId: 'org-1', schoolId: 'school-1' },
      { organizationId: 'org-2', schoolId: 'school-2' },
    ];

    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-1',
        scopes,
      })
    ).resolves.toBe(false);
    await expect(
      isAssignmentTypeAvailableForAnyScope({
        assignmentTypeId: 'at-1',
        scopes,
      })
    ).resolves.toBe(true);
  });

  test('candidate listing includes teacher-enabled org-hidden types and filters teacher-disabled org defaults', async () => {
    prisma.featureAccessTarget.findMany.mockResolvedValue([
      {
        featureKey: 'assignment_type:teacher-enabled',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: true,
      },
      {
        featureKey: 'assignment_type:teacher-disabled',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: false,
      },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'teacher-enabled',
        title: 'Teacher Enabled',
        organizationAssignments: [],
      },
      {
        id: 'teacher-disabled',
        title: 'Teacher Disabled',
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
      {
        id: 'org-default',
        title: 'Org Default',
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);

    const assignmentTypes = await getAvailableAssignmentTypesForScopes<{
      id: string;
      title: string;
      organizationAssignments?: Array<{ organizationId: string }>;
    }>({
      scopes: [
        {
          organizationId: 'org-1',
          schoolId: 'school-1',
          teacherProfileId: 'teacher-1',
        },
      ],
      select: { id: true, title: true },
      orderBy: { position: 'asc' },
    });

    expect(prisma.assignmentType.findMany).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        OR: [
          {
            organizationAssignments: {
              some: { organizationId: { in: ['org-1'] } },
            },
          },
          { id: { in: ['teacher-enabled', 'teacher-disabled'] } },
        ],
      },
      select: {
        id: true,
        title: true,
        organizationAssignments: {
          select: { organizationId: true },
        },
      },
      orderBy: { position: 'asc' },
    });
    expect(assignmentTypes).toEqual([
      { id: 'teacher-enabled', title: 'Teacher Enabled' },
      { id: 'org-default', title: 'Org Default' },
    ]);
  });

  test('does not query assignment types when no usable scope exists', async () => {
    await expect(
      getAvailableAssignmentTypesForScopes({
        scopes: [{ organizationId: null, teacherProfileId: 'teacher-1' }],
        select: { id: true },
      })
    ).resolves.toEqual([]);
    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-1',
        scopes: [],
      })
    ).resolves.toBe(false);

    expect(prisma.assignmentType.findMany).not.toHaveBeenCalled();
    expect(prisma.assignmentType.findFirst).not.toHaveBeenCalled();
    expect(prisma.featureAccessTarget.findMany).not.toHaveBeenCalled();
  });
});
