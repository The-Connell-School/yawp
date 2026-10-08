import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findFirst: mock(),
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
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForAnyScope,
  isAssignmentTypeAvailableForEveryScope,
} = await import('./assignment-type-access.server');

const scope = {
  organizationId: 'org-1',
  schoolId: 'school-1',
  teacherProfileId: 'teacher-1',
};

function mockOrgDefaults(typeIds: string[]) {
  prisma.organizationAssignmentType.findMany.mockResolvedValue(
    typeIds.map((assignmentTypeId) => ({
      organizationId: 'org-1',
      assignmentTypeId,
    }))
  );
}

function mockSchoolConfig({
  customized = false,
  typeIds = [],
}: {
  customized?: boolean;
  typeIds?: string[];
}) {
  prisma.school.findMany.mockResolvedValue([
    {
      id: 'school-1',
      organizationId: 'org-1',
      assignmentTypesCustomized: customized,
      assignmentTypeAssignments: typeIds.map((assignmentTypeId) => ({
        assignmentTypeId,
      })),
    },
  ]);
}

function mockTeacherConfig({
  customized = false,
  typeIds = [],
}: {
  customized?: boolean;
  typeIds?: string[];
}) {
  prisma.orgMembership.findMany.mockResolvedValue([
    {
      id: 'teacher-1',
      organizationId: 'org-1',
      assignmentTypesCustomized: customized,
      assignmentTypeAssignments: typeIds.map((assignmentTypeId) => ({
        assignmentTypeId,
      })),
    },
  ]);
}

function mockScopeConfig({
  orgTypeIds = ['at-1', 'at-2'],
  school = { customized: false, typeIds: [] as string[] },
  teacher = { customized: false, typeIds: [] as string[] },
}) {
  mockOrgDefaults(orgTypeIds);
  mockSchoolConfig(school);
  mockTeacherConfig(teacher);
}

describe('assignment type inheritance resolution', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
  });

  test('uses organization defaults when school and teacher inherit', async () => {
    mockScopeConfig({ orgTypeIds: ['at-1'] });
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      archivedAt: null,
    });

    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-1',
        scopes: [scope],
      })
    ).resolves.toBe(true);
  });

  test('school customize narrows the effective set for inheriting teachers', async () => {
    mockScopeConfig({
      orgTypeIds: ['at-1', 'at-2'],
      school: { customized: true, typeIds: ['at-1'] },
    });
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-2',
      archivedAt: null,
    });

    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-2',
        scopes: [scope],
      })
    ).resolves.toBe(false);
  });

  test('teacher customize takes precedence over school configuration', async () => {
    mockScopeConfig({
      orgTypeIds: ['at-1', 'at-2'],
      school: { customized: true, typeIds: ['at-1', 'at-2'] },
      teacher: { customized: true, typeIds: ['at-2'] },
    });
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      archivedAt: null,
    });

    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-1',
        scopes: [scope],
      })
    ).resolves.toBe(false);
  });

  test('teacher inherits a customized school configuration', async () => {
    mockScopeConfig({
      orgTypeIds: ['at-1', 'at-2', 'at-3'],
      school: { customized: true, typeIds: ['at-1', 'at-3'] },
    });
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-3',
      archivedAt: null,
    });

    await expect(
      isAssignmentTypeAvailableForEveryScope({
        assignmentTypeId: 'at-3',
        scopes: [scope],
      })
    ).resolves.toBe(true);
  });

  test('every scope requires each selected class scope to have access', async () => {
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'at-1' },
      { organizationId: 'org-2', assignmentTypeId: 'at-1' },
    ]);
    prisma.school.findMany.mockResolvedValue([
      {
        id: 'school-1',
        organizationId: 'org-1',
        assignmentTypesCustomized: false,
        assignmentTypeAssignments: [],
      },
      {
        id: 'school-2',
        organizationId: 'org-2',
        assignmentTypesCustomized: true,
        assignmentTypeAssignments: [],
      },
    ]);
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      archivedAt: null,
    });

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

  test('lists assignment types visible in at least one scope', async () => {
    mockScopeConfig({
      orgTypeIds: ['at-1', 'at-2'],
      teacher: { customized: true, typeIds: ['at-1'] },
    });
    prisma.assignmentType.findMany.mockResolvedValue([
      { id: 'at-1', title: 'Allowed' },
      { id: 'at-2', title: 'Org Only' },
    ]);

    const assignmentTypes = await getAvailableAssignmentTypesForScopes<{
      id: string;
      title: string;
    }>({
      scopes: [scope],
      select: { id: true, title: true },
      orderBy: { position: 'asc' },
    });

    expect(assignmentTypes).toEqual([{ id: 'at-1', title: 'Allowed' }]);
  });

  /**
   * Brian (2026-10-02): swapping a teacher from Daily Pages to SJP Daily Pages in
   * their picker must not hide existing Daily Pages assignments or submissions.
   * Visibility here only gates *new* work; historical rows stay keyed by assignment id.
   */
  test('hides Daily Pages from the picker after a teacher swap without implying submission loss', async () => {
    const dailyPagesTypeId = 'cmlgtyo8j01em0qjs6knw7cni';
    const sjpTypeId = 'cmtk7cy2r017y01l8r5ix4kxf';

    mockScopeConfig({
      orgTypeIds: [dailyPagesTypeId, sjpTypeId],
      teacher: { customized: true, typeIds: [sjpTypeId] },
    });
    prisma.assignmentType.findMany.mockResolvedValue([
      { id: sjpTypeId, title: 'SJP Daily Pages' },
    ]);

    const visible = await getAvailableAssignmentTypesForScopes<{ id: string }>({
      scopes: [{ organizationId: 'org-1', teacherProfileId: 'teacher-1' }],
      select: { id: true },
    });

    expect(visible.map((row) => row.id)).toEqual([sjpTypeId]);
    expect(visible.some((row) => row.id === dailyPagesTypeId)).toBe(false);
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
    expect(prisma.organizationAssignmentType.findMany).not.toHaveBeenCalled();
  });
});
