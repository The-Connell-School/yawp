import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const getAvailableAssignmentTypesForScopes = mock();
const prisma = {
  orgMembership: { findUnique: mock() },
  teacherTraining: { findMany: mock() },
  class: { findMany: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/assignment-type-access.server', () => ({
  getAvailableAssignmentTypesForScopes,
}));

const { listAssignableTypes, listLoungeMaterials } =
  await import('./yawp-catalog.server');

afterAll(() => {
  mock.restore();
});

const ctx = { membershipId: 'teacher-1', organizationId: 'org-1' };

const training = {
  id: 'tr-1',
  title: 'Teaching Argument',
  description: null,
  teacherTrainingModules: [
    {
      id: 'mod-1',
      title: 'Conclusions',
      description: null,
      position: 1,
      resources: [
        {
          id: 'res-deck',
          name: 'Conclusions class slides.pptx',
          contentType: 'application/vnd.ms-powerpoint',
        },
      ],
    },
  ],
  resources: [],
};

beforeEach(() => {
  prisma.orgMembership.findUnique
    .mockReset()
    .mockResolvedValue({ _count: { assignedTeacherTrainings: 0 } });
  prisma.teacherTraining.findMany.mockReset().mockResolvedValue([training]);
  prisma.class.findMany
    .mockReset()
    .mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);
  getAvailableAssignmentTypesForScopes.mockReset().mockResolvedValue([
    { id: 'at-1', title: 'Daily Pages', systemKey: null },
    { id: 'at-2', title: 'Argument Essay', systemKey: null },
  ]);
});

describe('listLoungeMaterials', () => {
  test('returns linkable material for a training', async () => {
    const materials = await listLoungeMaterials(ctx);
    expect(materials[0]).toMatchObject({
      title: 'Teaching Argument',
      href: '/app/teacher-trainings/tr-1',
    });
    expect(materials[0]!.modules[0]!.materials[0]).toMatchObject({
      kind: 'slides',
      href: '/api/teacher-training-module-resource/res-deck',
    });
  });

  test('shows only assigned courses when the teacher has any', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      _count: { assignedTeacherTrainings: 2 },
    });

    await listLoungeMaterials(ctx);

    // Mirrors the Teacher's Lounge itself: assigned-only once anything is
    // assigned, everything otherwise.
    expect(prisma.teacherTraining.findMany.mock.calls[0][0].where).toEqual({
      assignedTeachers: { some: { id: 'teacher-1' } },
    });
  });

  test('shows the whole library when nothing is assigned', async () => {
    await listLoungeMaterials(ctx);
    expect(
      prisma.teacherTraining.findMany.mock.calls[0][0].where
    ).toBeUndefined();
  });
});

describe('listAssignableTypes', () => {
  test('resolves the types this teacher can actually assign', async () => {
    const types = await listAssignableTypes(ctx);
    expect(types).toEqual([
      { id: 'at-1', title: 'Daily Pages' },
      { id: 'at-2', title: 'Argument Essay' },
    ]);
  });

  test('scopes resolution to the teacher’s own active classes', async () => {
    await listAssignableTypes(ctx);

    expect(prisma.class.findMany.mock.calls[0][0].where).toMatchObject({
      teachers: { some: { id: 'teacher-1' } },
      isArchived: false,
    });
    expect(
      getAvailableAssignmentTypesForScopes.mock.calls[0][0].scopes
    ).toEqual([
      {
        organizationId: 'org-1',
        schoolId: 'school-1',
        teacherProfileId: 'teacher-1',
      },
    ]);
  });

  test('returns nothing when the teacher has no classes yet', async () => {
    prisma.class.findMany.mockResolvedValue([]);
    expect(await listAssignableTypes(ctx)).toEqual([]);
    expect(getAvailableAssignmentTypesForScopes).not.toHaveBeenCalled();
  });
});
