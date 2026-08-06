import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const getAvailableAssignmentTypesForScopes = mock();
const prisma = {
  orgMembership: { findUnique: mock() },
  teacherTraining: { findMany: mock() },
  teacherTrainingModuleResource: { findFirst: mock() },
  class: { findMany: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/assignment-type-access.server', () => ({
  getAvailableAssignmentTypesForScopes,
}));

const { listAssignableTypes, listLoungeMaterials, readLoungeMaterial } =
  await import('./yawp-catalog.server');
const { readFixture } = await import('~/domain/office/fixtures');

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
  prisma.teacherTrainingModuleResource.findFirst.mockReset();
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

describe('readLoungeMaterial', () => {
  /** A real .pptx / .docx, read through the actual office readers. */
  function stubResource(name: string, fixture: 'deck.pptx' | 'handout.docx') {
    prisma.teacherTrainingModuleResource.findFirst.mockResolvedValue({
      name,
      contentType: '',
      blob: readFixture(fixture),
    });
  }

  test('reads a deck slide by slide, in presentation order', async () => {
    stubResource('Conclusions.pptx', 'deck.pptx');

    const result = await readLoungeMaterial(ctx, 'res-deck');

    expect(result).toMatchObject({ kind: 'slides', truncated: false });
    const slides = (result as { slides: Array<{ number: number }> }).slides;
    expect(slides).toHaveLength(4);
    expect(slides[0]).toMatchObject({
      number: 1,
      lines: ['Evidence that earns its place', 'English 10 · Period 3'],
      notes: 'Set the stakes before naming the skill.',
    });
  });

  test('reads a document as text', async () => {
    stubResource('Handout.docx', 'handout.docx');

    const result = await readLoungeMaterial(ctx, 'res-doc');

    expect(result).toMatchObject({ kind: 'document' });
    expect((result as { text: string }).text).toContain('Diagnose & Repair');
  });

  test('hands back the same href the listing gave, so a resource block matches', async () => {
    stubResource('Conclusions.pptx', 'deck.pptx');

    const result = await readLoungeMaterial(ctx, 'res-deck');

    expect((result as { href: string }).href).toBe(
      '/api/teacher-training-module-resource/res-deck'
    );
  });

  test('cannot open a file this teacher was never shown', async () => {
    // The scoping has to match the listing exactly. A resource id is a handle
    // the model can hold onto, and this must not become a way around it.
    prisma.teacherTrainingModuleResource.findFirst.mockResolvedValue(null);

    const result = await readLoungeMaterial(ctx, 'someone-elses-deck');

    expect((result as { error: string }).error).toMatch(
      /list_lounge_materials/
    );
  });

  test('scopes the lookup through the course the teacher is assigned', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({
      _count: { assignedTeacherTrainings: 2 },
    });
    prisma.teacherTrainingModuleResource.findFirst.mockResolvedValue(null);

    await readLoungeMaterial(ctx, 'res-deck');

    const where = prisma.teacherTrainingModuleResource.findFirst.mock
      .calls[0]![0].where as Record<string, any>;
    expect(where.id).toBe('res-deck');
    expect(where.teacherTrainingModule.teacherTraining).toEqual({
      assignedTeachers: { some: { id: 'teacher-1' } },
    });
  });

  test('refuses a format it cannot open instead of guessing at it', async () => {
    prisma.teacherTrainingModuleResource.findFirst.mockResolvedValue({
      name: 'Conclusions.key',
      contentType: 'application/x-iwork-keynote-sffkey',
      blob: Buffer.from('not a zip we can read'),
    });

    const result = await readLoungeMaterial(ctx, 'res-key');

    expect((result as { error: string }).error).toMatch(
      /only \.pptx and \.docx/
    );
    expect((result as { error: string }).error).toMatch(/say nothing about/i);
  });

  test('says so when a file is corrupt rather than throwing', async () => {
    prisma.teacherTrainingModuleResource.findFirst.mockResolvedValue({
      name: 'Conclusions.pptx',
      contentType: '',
      blob: Buffer.from('this is not a zip archive at all'),
    });

    const result = await readLoungeMaterial(ctx, 'res-broken');

    expect((result as { error: string }).error).toMatch(/could not be opened/);
  });

  test('says so when a deck is nothing but pictures', async () => {
    // An image-only deck reads as zero text, and the planner must not fill
    // that silence in with what the filename suggests.
    prisma.teacherTrainingModuleResource.findFirst.mockResolvedValue({
      name: 'Photos.pptx',
      contentType: '',
      blob: readFixture('deck-images-only.pptx'),
    });

    const result = await readLoungeMaterial(ctx, 'res-images');

    expect((result as { error: string }).error).toMatch(/no readable text/);
    expect((result as { error: string }).error).toMatch(/say nothing about/i);
  });
});
