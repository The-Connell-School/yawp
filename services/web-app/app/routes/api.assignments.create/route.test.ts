import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: {
    findMany: mock(),
  },
  assignmentType: {
    findFirst: mock(),
  },
  featureAccessTarget: {
    findMany: mock(),
  },
  apHistoryPromptLibraryEntry: {
    findFirst: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const isAssignmentsEnabledForContext = mock();
const isApHistoryEssayEnabledForContext = mock();
const isAssignmentCreationStandardizationEnabledForContext = mock();
const createAssignmentDeployedToClasses = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isAssignmentsEnabledForContext,
  isApHistoryEssayEnabledForContext,
  isAssignmentCreationStandardizationEnabledForContext,
}));
mock.module('~/utils/assignment-deployment.server', () => ({
  createAssignmentDeployedToClasses,
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

function mockAssignmentTypeAvailable({
  id = 'at-1',
  systemKey = 'generic_essay',
  organizationId = 'org-1',
} = {}) {
  prisma.assignmentType.findFirst.mockImplementation(async (args: any) =>
    args.select?.organizationAssignments
      ? { id, organizationAssignments: [{ organizationId }] }
      : { id, systemKey }
  );
}

describe('api.assignments.create', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
    prisma.assignmentType.findFirst.mockReset();
    prisma.featureAccessTarget.findMany.mockReset();
    prisma.apHistoryPromptLibraryEntry.findFirst.mockReset();
    createAssignmentDeployedToClasses.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    isAssignmentsEnabledForContext.mockReset();
    isApHistoryEssayEnabledForContext.mockReset();
    isAssignmentCreationStandardizationEnabledForContext.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org' },
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
      { id: 'class-2', school: { id: 'school-2', organizationId: 'org-1' } },
    ]);
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
    mockAssignmentTypeAvailable();
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue(null);
    createAssignmentDeployedToClasses.mockResolvedValue({ id: 'assignment-1' });
    isAssignmentsEnabledForContext.mockResolvedValue(true);
    isApHistoryEssayEnabledForContext.mockResolvedValue(true);
    isAssignmentCreationStandardizationEnabledForContext.mockResolvedValue(true);
  });

  test('creates one standardized assignment per selected teacher-owned class', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        tutorContext: 'Help with structure.',
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
    expect(prisma.assignmentType.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'at-1', archivedAt: null },
      select: {
        id: true,
        organizationAssignments: {
          select: { organizationId: true },
        },
      },
    });
    expect(prisma.assignmentType.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'at-1',
        archivedAt: null,
      },
      select: { id: true, systemKey: true },
    });
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        title: 'Essay',
        prompt: 'Write the essay.',
        tutorContext: null,
        submitForGrade: true,
        pointValue: 100,
      }),
      classIds: ['class-1', 'class-2'],
    });
  });

  test('keeps legacy tutor context behavior when standardization is not enabled', async () => {
    isAssignmentCreationStandardizationEnabledForContext.mockResolvedValue(false);

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        tutorContext: 'Legacy context.',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        tutorContext: 'Legacy context.',
      }),
      classIds: ['class-1', 'class-2'],
    });
    const firstAssignment = createAssignmentDeployedToClasses.mock.calls[0][0].data;
    expect(firstAssignment).not.toHaveProperty('submitForGrade');
    expect(firstAssignment).not.toHaveProperty('pointValue');
  });

  test('creates ungraded assignments without a point value', async () => {
    prisma.class.findMany.mockResolvedValueOnce([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1'],
        prompt: 'Write the reflection.',
        submitForGrade: 'false',
        pointValue: '',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tutorContext: null,
        submitForGrade: false,
        pointValue: null,
      }),
      classIds: ['class-1'],
    });
  });

  test('rejects invalid graded point values before creating assignments', async () => {
    prisma.class.findMany.mockResolvedValueOnce([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1'],
        prompt: 'Write the essay.',
        submitForGrade: 'true',
        pointValue: '1001',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(400);
    expect(body.message).toBe(
      'Point value must be a positive whole number no greater than 1000.'
    );
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });

  test('rejects unowned classes', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
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
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
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
      schoolId: 'school-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
    expect(isAssignmentsEnabledForContext).toHaveBeenNthCalledWith(2, {
      organizationId: 'org-1',
      schoolId: 'school-2',
      teacherProfileId: 'teacher-1',
      classIds: ['class-2'],
    });
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });

  test('rejects mixed standardization and legacy classes in the same create request', async () => {
    isAssignmentCreationStandardizationEnabledForContext.mockImplementation(
      async ({ classIds }) => classIds?.includes('class-1')
    );

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        submitForGrade: 'true',
        pointValue: '25',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
    expect(responseStatus(response)).toBe(403);
    expect(body.message).toBe(
      'Assignment creation standardization is not enabled for one or more classes.'
    );
    expect(
      isAssignmentCreationStandardizationEnabledForContext
    ).toHaveBeenCalledTimes(2);
    expect(
      isAssignmentCreationStandardizationEnabledForContext
    ).toHaveBeenNthCalledWith(1, {
      organizationId: 'org-1',
      schoolId: 'school-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
    expect(
      isAssignmentCreationStandardizationEnabledForContext
    ).toHaveBeenNthCalledWith(2, {
      organizationId: 'org-1',
      schoolId: 'school-2',
      teacherProfileId: 'teacher-1',
      classIds: ['class-2'],
    });
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
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
      where: { id: 'at-forbidden', archivedAt: null },
      select: {
        id: true,
        organizationAssignments: {
          select: { organizationId: true },
        },
      },
    });
    expect(prisma.assignmentType.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'at-forbidden',
        archivedAt: null,
      },
      select: { id: true, systemKey: true },
    });
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
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
    mockAssignmentTypeAvailable({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue(
      libraryEntry
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
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'ap-type-1',
        title: 'Unit 7 DBQ',
        prompt: libraryEntry.prompt,
        tutorContext: null,
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
      classIds: ['class-1', 'class-2'],
    });
  });

  test('creates AP History assignments when AP access is school-scoped', async () => {
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
      sources: [],
    };
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);
    mockAssignmentTypeAvailable({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue(
      libraryEntry
    );
    isApHistoryEssayEnabledForContext.mockImplementation(
      async ({ schoolIds }) => schoolIds?.includes('school-1') ?? false
    );

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'ap-type-1',
        classIds: ['class-1'],
        apHistoryLibraryEntryId: 'apush-dbq-new-deal-federal-power',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(isApHistoryEssayEnabledForContext).toHaveBeenCalledWith({
      organizationId: 'org-1',
      schoolIds: ['school-1'],
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'ap-type-1',
        prompt: libraryEntry.prompt,
        apHistorySnapshot: expect.objectContaining({
          libraryEntryId: 'apush-dbq-new-deal-federal-power',
        }),
      }),
      classIds: ['class-1'],
    });
  });

  test('rejects AP History assignment creation when AP access is disabled', async () => {
    mockAssignmentTypeAvailable({
      id: 'ap-type-1',
      systemKey: 'ap_history_essay',
    });
    isApHistoryEssayEnabledForContext.mockImplementation(
      async ({ classIds }) => !classIds?.includes('class-2')
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
      'AP History Essay is not enabled for one or more classes.'
    );
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });

  test('rejects AP History assignment creation without a library entry id', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { organizationId: 'org-1' } },
    ]);
    mockAssignmentTypeAvailable({
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
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });

  test('rejects unavailable AP History library entries', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { organizationId: 'org-1' } },
    ]);
    mockAssignmentTypeAvailable({
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
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });
});
