import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const prisma = {
  assignment: {
    findFirst: mock(),
    findMany: mock(),
    update: mock(),
    delete: mock(),
    deleteMany: mock(),
  },
  assignmentType: {
    findMany: mock(),
    findFirst: mock(),
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
  class: {
    findMany: mock(),
  },
  document: {
    update: mock(),
    updateMany: mock(),
    delete: mock(),
    deleteMany: mock(),
  },
  writingPracticeAssignment: {
    findMany: mock(),
    deleteMany: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action, loader, sanitizeAssignmentCreateReturnTo } =
  await import('./route');

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
  assignmentTypeId: 'at-1',
  assignmentType: { systemKey: 'generic_essay' },
  classAssignments: [
    {
      class: {
        id: 'class-1',
        school: { id: 'school-1', organizationId: 'org-1' },
      },
    },
  ],
};

describe('app.assignments action', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
    });
    prisma.assignment.findFirst.mockResolvedValue(ownedAssignment);
    prisma.assignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        classAssignments: [
          {
            class: {
              id: 'class-1',
              school: { id: 'school-1', organizationId: 'org-1' },
            },
          },
        ],
      },
      {
        id: 'assignment-2',
        classAssignments: [
          {
            class: {
              id: 'class-1',
              school: { id: 'school-1', organizationId: 'org-1' },
            },
          },
        ],
      },
    ]);
    prisma.assignment.deleteMany.mockResolvedValue({ count: 2 });
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'at-1' },
    ]);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'at-1',
        systemKey: 'generic_essay',
        organizationAssignments: [{ organizationId: 'org-1' }],
      },
    ]);
  });

  test('rejects non-teachers', async () => {
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
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
          classAssignments: {
            some: {
              class: { teachers: { some: { id: 'teacher-1' } } },
            },
          },
        }),
      })
    );
  });

  test('deletes multiple assignments in one action', async () => {
    const form = new FormData();
    form.append('intent', 'delete-assignments');
    form.append('assignmentIds', 'assignment-1');
    form.append('assignmentIds', 'assignment-2');

    const response = await action({
      request: new Request('https://example.com/app/assignments', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(prisma.assignment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['assignment-1', 'assignment-2'] } },
    });
  });

  test('deletes writing practice assignments alongside standard ones', async () => {
    prisma.assignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        classAssignments: [
          {
            class: {
              id: 'class-1',
              school: { id: 'school-1', organizationId: 'org-1' },
            },
          },
        ],
      },
    ]);
    prisma.writingPracticeAssignment.findMany.mockResolvedValue([
      { id: 'practice-1' },
    ]);

    const form = new FormData();
    form.append('intent', 'delete-assignments');
    form.append('assignmentIds', 'assignment-1');
    form.append('practiceAssignmentIds', 'practice-1');

    const response = await action({
      request: new Request('https://example.com/app/assignments', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Deleted 2 assignment(s).');
    expect(prisma.assignment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['assignment-1'] } },
    });
    expect(prisma.writingPracticeAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['practice-1'] },
          classAssignments: {
            some: {},
            every: {
              class: { teachers: { some: { id: 'teacher-1' } } },
            },
          },
        }),
      })
    );
    expect(prisma.writingPracticeAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['practice-1'] } },
    });
  });

  test('deletes writing practice assignments on their own', async () => {
    prisma.writingPracticeAssignment.findMany.mockResolvedValue([
      { id: 'practice-1' },
    ]);

    const form = new FormData();
    form.append('intent', 'delete-assignments');
    form.append('practiceAssignmentIds', 'practice-1');

    const response = await action({
      request: new Request('https://example.com/app/assignments', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(prisma.assignment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.writingPracticeAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['practice-1'] } },
    });
  });

  test('rejects deleting writing practice assignments the teacher does not own', async () => {
    prisma.writingPracticeAssignment.findMany.mockResolvedValue([]);

    const form = new FormData();
    form.append('intent', 'delete-assignments');
    form.append('practiceAssignmentIds', 'practice-x');

    const response = await action({
      request: new Request('https://example.com/app/assignments', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(400);
    expect(prisma.writingPracticeAssignment.deleteMany).not.toHaveBeenCalled();
  });

  test('rejects deleting a shared practice assignment unless every deployment belongs to the teacher', async () => {
    // The ownership query excludes an assignment that also targets another
    // teacher's class.
    prisma.writingPracticeAssignment.findMany.mockResolvedValue([]);

    const form = new FormData();
    form.append('intent', 'delete-assignments');
    form.append('practiceAssignmentIds', 'shared-practice');

    const response = await action({
      request: new Request('https://example.com/app/assignments', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(400);
    const where =
      prisma.writingPracticeAssignment.findMany.mock.calls[0][0].where;
    expect(where.classAssignments).toEqual({
      some: {},
      every: {
        class: { teachers: { some: { id: 'teacher-1' } } },
      },
    });
    expect(prisma.writingPracticeAssignment.deleteMany).not.toHaveBeenCalled();
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

  test('allows safe app return targets for assignment creation', () => {
    expect(sanitizeAssignmentCreateReturnTo('/app')).toBe('/app');
    expect(
      sanitizeAssignmentCreateReturnTo('/app/my-classes/class-1?tab=documents')
    ).toBe('/app/my-classes/class-1?tab=documents');
  });

  test('rejects unsafe assignment creation return targets', () => {
    expect(sanitizeAssignmentCreateReturnTo('')).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo(null)).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo('assignments')).toBeNull();
    expect(
      sanitizeAssignmentCreateReturnTo('https://example.com/app')
    ).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo('//example.com/app')).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo('/application')).toBeNull();
  });

  test('updates assignment fields with grading intent', async () => {
    const response = await action({
      request: requestFor({
        intent: 'update-assignment',
        assignmentId: 'assignment-1',
        assignmentTypeId: 'at-1',
        title: 'Updated Title',
        prompt: 'Updated prompt.',
        submitForGrade: 'true',
        pointValue: '50',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(prisma.assignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: {
        assignmentTypeId: 'at-1',
        title: 'Updated Title',
        prompt: 'Updated prompt.',
        submitForGrade: true,
        pointValue: 50,
      },
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
});

describe('app.assignments loader', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
    });
  });

  test('reports missing active classes separately from assignment type availability', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    const response = await loader({
      request: new Request('https://example.com/app/assignments'),
      params: {},
    } as any);

    const body = await readBody(response);

    expect(body.hasActiveClasses).toBe(false);
    expect(body.assignmentsEnabled).toBe(false);
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
    expect(prisma.assignmentType.findMany).not.toHaveBeenCalled();
    expect(prisma.organizationAssignmentType.findMany).not.toHaveBeenCalled();
    expect(prisma.writingPracticeAssignment.findMany).not.toHaveBeenCalled();
  });

  test('returns writing practice assignments with lesson titles resolved', async () => {
    const { getQuickWritingLessonGroups } =
      await import('~/utils/writing-lessons/static-lessons.server');
    const firstLesson = getQuickWritingLessonGroups()[0]!.lessons[0]!;

    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        grade: '9',
        period: '1',
        title: null,
        school: { id: 'school-1', name: 'School', organizationId: 'org-1' },
      },
    ]);
    prisma.assignment.findMany.mockResolvedValue([]);
    prisma.organizationAssignmentType.findMany.mockResolvedValue([]);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.writingPracticeAssignment.findMany.mockResolvedValue([
      {
        id: 'practice-1',
        title: null,
        lessonSlugs: [firstLesson.slug, 'unknown-slug'],
        problemCount: 5,
        dueAt: new Date('2026-07-20T00:00:00Z'),
        createdAt: new Date('2026-07-01T00:00:00Z'),
        classAssignments: [
          {
            id: 'practice-ca-1',
            class: { id: 'class-1', grade: '9', period: '1', title: null },
            _count: { attempts: 3 },
          },
        ],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.com/app/assignments'),
      params: {},
    } as any);

    const body = await readBody(response);

    expect(prisma.writingPracticeAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classAssignments: { some: { classId: { in: ['class-1'] } } },
        },
      })
    );
    expect(body.writingPracticeAssignments).toHaveLength(1);
    expect(body.writingPracticeAssignments[0]).toMatchObject({
      id: 'practice-1',
      problemCount: 5,
      lessonTitles: [firstLesson.title, 'unknown-slug'],
      dueAt: '2026-07-20T00:00:00.000Z',
    });
    expect(
      body.writingPracticeAssignments[0].classAssignments[0]._count.attempts
    ).toBe(3);
  });

  test('does not describe teachers without classes as missing organization enablement', () => {
    const source = readFileSync(
      new URL('./route.tsx', import.meta.url),
      'utf8'
    );

    expect(source).not.toContain(
      'Assignments are not enabled for your organization yet.'
    );
    expect(source).toContain('You are not assigned to any active classes yet.');
  });
});
