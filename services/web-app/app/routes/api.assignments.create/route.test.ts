import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: {
    findMany: mock(),
  },
  assignmentType: {
    findFirst: mock(),
  },
  assignment: {
    createMany: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();
const isAssignmentsEnabledForContext = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isAssignmentsEnabledForContext,
}));

const { action } = await import('./route');

function requestFor(body: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item);
    } else {
      form.append(key, value);
    }
  }
  return new Request('https://example.com/api/assignments/create', {
    method: 'POST',
    body: form,
  });
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function responseStatus(response: any) {
  return response.status ?? response.init?.status;
}

describe('api.assignments.create', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignment.createMany.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    isAssignmentsEnabledForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { organizationId: 'org-1' } },
      { id: 'class-2', school: { organizationId: 'org-1' } },
    ]);
    prisma.assignmentType.findFirst.mockResolvedValue({ id: 'at-1' });
    prisma.assignment.createMany.mockResolvedValue({ count: 2 });
    isAssignmentsEnabledForContext.mockResolvedValue(true);
  });

  test('creates one assignment per selected teacher-owned class', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        tutorContext: 'Help with structure.',
        dueDate: '2026-05-20',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['class-1', 'class-2'] },
          teachers: { some: { id: 'teacher-1' } },
          isArchived: false,
        }),
      })
    );
    expect(prisma.assignmentType.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'at-1',
        archivedAt: null,
        organizationAssignments: {
          some: { organizationId: { in: ['org-1'] } },
        },
      },
      select: { id: true },
    });
    expect(prisma.assignment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          classId: 'class-1',
          assignmentTypeId: 'at-1',
          title: 'Essay',
          prompt: 'Write the essay.',
        }),
        expect.objectContaining({
          classId: 'class-2',
          assignmentTypeId: 'at-1',
          title: 'Essay',
          prompt: 'Write the essay.',
        }),
      ],
    });
  });

  test('rejects unowned classes', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { organizationId: 'org-1' } },
    ]);

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(404);
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });

  test('rejects mixed pilot and non-pilot classes in the same create request', async () => {
    isAssignmentsEnabledForContext.mockImplementation(async ({ classIds }) =>
      classIds?.includes('class-1')
    );

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(403);
    expect(body.message).toBe(
      'Assignments are not enabled for one or more classes.'
    );
    expect(isAssignmentsEnabledForContext).toHaveBeenCalledTimes(2);
    expect(isAssignmentsEnabledForContext).toHaveBeenNthCalledWith(1, {
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
    expect(isAssignmentsEnabledForContext).toHaveBeenNthCalledWith(2, {
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-2'],
    });
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });

  test('rejects assignment types outside the teacher scope or archived', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(null);

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-forbidden',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(400);
    expect(prisma.assignmentType.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'at-forbidden',
        archivedAt: null,
        organizationAssignments: {
          some: { organizationId: { in: ['org-1'] } },
        },
      },
      select: { id: true },
    });
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });
});
