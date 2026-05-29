import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: {
    findMany: mock(),
  },
  assignmentType: {
    findFirst: mock(),
  },
  apHistoryPromptLibraryEntry: {
    findFirst: mock(),
  },
  assignment: {
    createMany: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();
const isAssignmentsEnabledForContext = mock();
const isApHistoryEssayEnabledForContext = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isAssignmentsEnabledForContext,
  isApHistoryEssayEnabledForContext,
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
    prisma.apHistoryPromptLibraryEntry.findFirst.mockReset();
    prisma.assignment.createMany.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    isAssignmentsEnabledForContext.mockReset();
    isApHistoryEssayEnabledForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { organizationId: 'org-1' } },
      { id: 'class-2', school: { organizationId: 'org-1' } },
    ]);
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      systemKey: 'generic_essay',
    });
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue(null);
    prisma.assignment.createMany.mockResolvedValue({ count: 2 });
    isAssignmentsEnabledForContext.mockResolvedValue(true);
    isApHistoryEssayEnabledForContext.mockResolvedValue(true);
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
      select: { id: true, systemKey: true },
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
      select: { id: true, systemKey: true },
    });
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });

  test('creates AP History assignments from a curated library entry snapshot', async () => {
    const libraryEntry = {
      externalKey: 'apush-dbq-new-deal-federal-power',
      course: 'apush',
      essayType: 'dbq',
      title: 'New Deal and Federal Power DBQ',
      prompt:
        'Evaluate the extent to which the New Deal changed the role of the federal government.',
      period: '1932-1980',
      periodNumber: 7,
      reasoningSkill: 'causation',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 60,
      sources: [
        {
          externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
          position: 1,
          title: 'Document 1',
          attribution: 'Franklin D. Roosevelt, fireside chat, 1933',
          body: 'The only thing we have to fear is fear itself.',
          caption: 'FDR addresses the banking crisis.',
          mediaType: 'text',
          imageUrl: null,
          imageAlt: null,
          provenanceUrl: 'https://example.test/doc-1',
        },
      ],
    };
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue(
      libraryEntry,
    );

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'ap-type-1',
        classIds: ['class-1', 'class-2'],
        title: 'Unit 7 DBQ',
        apHistoryLibraryEntryId: 'apush-dbq-new-deal-federal-power',
        dueDate: '2026-05-20',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledTimes(2);
    expect(prisma.apHistoryPromptLibraryEntry.findFirst).toHaveBeenCalledWith({
      where: {
        assignmentTypeId: 'ap-type-1',
        externalKey: 'apush-dbq-new-deal-federal-power',
        archivedAt: null,
        course: 'apush',
      },
      include: { sources: { orderBy: { position: 'asc' } } },
    });
    expect(prisma.assignment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          classId: 'class-1',
          assignmentTypeId: 'ap-type-1',
          title: 'Unit 7 DBQ',
          prompt: libraryEntry.prompt,
          tutorContext: null,
          dueDate: new Date(Date.UTC(2026, 4, 20)),
          apHistorySnapshot: expect.objectContaining({
            schemaVersion: 1,
            libraryEntryId: 'apush-dbq-new-deal-federal-power',
            essayType: 'dbq',
            sources: [
              expect.objectContaining({
                body: 'The only thing we have to fear is fear itself.',
              }),
            ],
          }),
        }),
        expect.objectContaining({
          classId: 'class-2',
          prompt: libraryEntry.prompt,
          tutorContext: null,
          apHistorySnapshot: expect.objectContaining({
            schemaVersion: 1,
            libraryEntryId: 'apush-dbq-new-deal-federal-power',
            essayType: 'dbq',
          }),
        }),
      ],
    });
  });

  test('rejects AP History assignment creation when AP access is disabled', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });
    isApHistoryEssayEnabledForContext.mockImplementation(async ({ classIds }) =>
      !classIds?.includes('class-2')
    );

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'ap-type-1',
        classIds: ['class-1', 'class-2'],
        title: 'Unit 7 DBQ',
        apHistoryLibraryEntryId: 'apush-dbq-new-deal-federal-power',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(403);
    expect(body.message).toBe(
      'AP History Essay is not enabled for one or more classes.',
    );
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });

  test('rejects AP History assignment creation without a library entry id', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { organizationId: 'org-1' } },
    ]);
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'ap-type-1',
        classIds: ['class-1'],
        title: 'Unit 7 DBQ',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(400);
    expect(body.message).toBe('AP History library entry is required.');
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });

  test('rejects unavailable AP History library entries', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { organizationId: 'org-1' } },
    ]);
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue(null);

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'ap-type-1',
        classIds: ['class-1'],
        title: 'Unit 7 DBQ',
        apHistoryLibraryEntryId: 'apush-dbq-new-deal-federal-power',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(400);
    expect(body.message).toBe('AP History library entry is unavailable.');
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
  });
});
