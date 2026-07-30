import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: {
    findUnique: mock(),
    update: mock(),
  },
  orgMembership: {
    findMany: mock(),
    findUnique: mock(),
  },
};

const requireAdmin = mock();
const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/auth.server.js', () => ({
  requireAdmin,
  requireUserId,
  requireMembership,
}));

const { action: routeAction, loader: routeLoader } = await import('./route');
const action = routeAction as any;
const loader = routeLoader as any;

describe('admin assignment type detail action', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentType.update.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.orgMembership.findUnique.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireAdmin.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.assignmentType.findUnique.mockResolvedValue({ id: 'at-1' });
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.orgMembership.findUnique.mockResolvedValue({ id: 'teacher-1' });
  });

  test('archives assignment types instead of hard deleting them', async () => {
    const form = new FormData();
    form.set('intent', 'deleteCourse');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: { archivedAt: expect.any(Date) },
    });
    const redirectResponse = response as Response;
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get('Location')).toBe(
      '/app/admin/assignments'
    );
  });

  test('unarchives assignment types when requested', async () => {
    const form = new FormData();
    form.set('intent', 'unarchiveCourse');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: { archivedAt: null },
    });
  });

  test('updates assignment-type-owned rubric and grading config', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'ACT Writing');
    form.set('description', 'ACT writing assignment type');
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'act_writing_2_12', minScore: 1, maxScore: 6 })
    );
    form.set(
      'rubricJson',
      JSON.stringify({
        categories: [
          {
            key: 'ideas_and_analysis',
            label: 'Ideas and Analysis',
            description: 'Generate productive ideas and analyze perspectives.',
            weight: 0.25,
          },
        ],
      })
    );
    form.set(
      'promptConfigJson',
      JSON.stringify({ gradingInstructions: 'Grade this as ACT Writing.' })
    );

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: expect.objectContaining({
        title: 'ACT Writing',
        description: 'ACT writing assignment type',
        scoringScaleJson: {
          type: 'act_writing_2_12',
          minScore: 1,
          maxScore: 6,
        },
        rubricJson: {
          categories: [
            {
              key: 'ideas_and_analysis',
              label: 'Ideas and Analysis',
              description:
                'Generate productive ideas and analyze perspectives.',
              weight: 0.25,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Grade this as ACT Writing.',
        },
        gradingOutputSchemaJson: {
          schemaVersion: 1,
          responseShape: 'categories_overall_comment',
        },
        gradingAssistantVersion: { increment: 1 },
      }),
    });
  });

  test('saves the course-level tutor guidelines', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'College Admissions Essay');
    form.set('tutorInstructions', '  You are the YAWP! Tutor.  ');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: expect.objectContaining({
        tutorInstructions: 'You are the YAWP! Tutor.',
      }),
    });
  });

  test('clears the guidelines when the box is emptied', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'College Admissions Essay');
    form.set('tutorInstructions', '   ');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: expect.objectContaining({ tutorInstructions: null }),
    });
  });

  test('leaves the guidelines alone when the form does not send them', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'College Admissions Essay');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const updateArgs = prisma.assignmentType.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data).not.toHaveProperty('tutorInstructions');
  });

  test('loads assignment type details without external rubric links', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'ACT Writing',
      kind: 'act_writing',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      description: null,
      archivedAt: null,
      assignmentModules: [],
      image: null,
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect((result as { data: any }).data.course.title).toBe('ACT Writing');
  });
});
