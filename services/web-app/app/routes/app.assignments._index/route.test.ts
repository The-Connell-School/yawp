import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignment: {
    findFirst: mock(),
    update: mock(),
    delete: mock(),
  },
  assignmentType: {
    findMany: mock(),
  },
  featureAccessTarget: {
    findMany: mock(),
  },
  document: {
    update: mock(),
    updateMany: mock(),
    delete: mock(),
    deleteMany: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();
const getAssignmentsEnabledClassIdsForContext = mock();
const getAssignmentCreationStandardizationEnabledClassIdsForContext = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireProfile }));
mock.module('~/utils/feature-flags.server', () => ({
  getAssignmentsEnabledClassIdsForContext,
  getAssignmentCreationStandardizationEnabledClassIdsForContext,
}));

const { action } = await import('./route');

function requestFor(body: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    form.append(key, value);
  }
  return new Request('https://example.com/app/assignments', {
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

const ownedAssignment = {
  id: 'assignment-1',
  classId: 'class-1',
  assignmentTypeId: 'at-1',
  tutorContext: null,
  assignmentType: { systemKey: 'generic_essay' },
  class: {
    id: 'class-1',
    school: { id: 'school-1', organizationId: 'org-1' },
  },
};

describe('app.assignments action', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    requireProfile.mockReset();
    getAssignmentsEnabledClassIdsForContext.mockReset();
    getAssignmentCreationStandardizationEnabledClassIdsForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.assignment.findFirst.mockResolvedValue(ownedAssignment);
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue(['class-1']);
    getAssignmentCreationStandardizationEnabledClassIdsForContext.mockResolvedValue(
      ['class-1']
    );
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'at-1',
        systemKey: 'generic_essay',
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);
  });

  test('rejects non-teachers', async () => {
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
      teacherProfile: null,
    });

    const response = await action({
      request: requestFor({
        intent: 'delete-assignment',
        assignmentId: 'assignment-1',
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(403);
  });

  test('404s when the assignment is not owned by the teacher', async () => {
    prisma.assignment.findFirst.mockResolvedValue(null);

    const response = await action({
      request: requestFor({
        intent: 'delete-assignment',
        assignmentId: 'assignment-x',
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(404);
    expect(prisma.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'assignment-x',
          class: { teachers: { some: { id: 'teacher-1' } } },
        }),
      })
    );
  });

  test('deletes the assignment without touching documents', async () => {
    const response = await action({
      request: requestFor({
        intent: 'delete-assignment',
        assignmentId: 'assignment-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(prisma.assignment.delete).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
    });
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(prisma.document.delete).not.toHaveBeenCalled();
    expect(prisma.document.deleteMany).not.toHaveBeenCalled();
  });

  test('updates assignment fields with grading intent', async () => {
    const response = await action({
      request: requestFor({
        intent: 'update-assignment',
        assignmentId: 'assignment-1',
        assignmentTypeId: 'at-1',
        title: 'Updated Title',
        prompt: 'Updated prompt.',
        dueDate: '2026-06-15',
        submitForGrade: 'true',
        pointValue: '50',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(prisma.assignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        title: 'Updated Title',
        prompt: 'Updated prompt.',
        submitForGrade: true,
        pointValue: 50,
      }),
    });
  });

  test('rejects updates when the prompt is empty', async () => {
    const response = await action({
      request: requestFor({
        intent: 'update-assignment',
        assignmentId: 'assignment-1',
        assignmentTypeId: 'at-1',
        title: 'Updated Title',
        prompt: '   ',
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(400);
    expect(prisma.assignment.update).not.toHaveBeenCalled();
  });

  test('blocks AP History assignments from generic editing', async () => {
    prisma.assignment.findFirst.mockResolvedValue({
      ...ownedAssignment,
      assignmentType: { systemKey: 'ap_history_essay' },
    });
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'at-1',
        systemKey: 'ap_history_essay',
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);

    const response = await action({
      request: requestFor({
        intent: 'update-assignment',
        assignmentId: 'assignment-1',
        assignmentTypeId: 'at-1',
        prompt: 'Updated prompt.',
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(400);
    expect(prisma.assignment.update).not.toHaveBeenCalled();
  });

  test('blocks managing assignments when the flag is disabled', async () => {
    getAssignmentsEnabledClassIdsForContext.mockResolvedValue([]);

    const response = await action({
      request: requestFor({
        intent: 'delete-assignment',
        assignmentId: 'assignment-1',
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(403);
    expect(prisma.assignment.delete).not.toHaveBeenCalled();
  });
});
