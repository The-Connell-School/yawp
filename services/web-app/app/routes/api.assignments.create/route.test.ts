import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: {
    findMany: mock(),
    findFirst: mock(),
  },
  assignmentType: {
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
  apHistoryPromptLibraryEntry: {
    findFirst: mock(),
  },
  classAssignment: {
    findMany: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const createAssignmentDeployedToClasses = mock();
const isAssignmentTypeAvailableForEveryScope = mock();
const uploadAssignmentPromptAttachment = mock();
const deleteAssignmentPromptAttachment = mock();
const saveAssignmentForReuse = mock();
const autoArrangeNewAssignment = mock();
class AssignmentPromptAttachmentError extends Error {}
const actualAssignmentPromptAttachment =
  await import('~/domain/assignments/assignment-prompt-attachment.server');
// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copy test-preload.ts captured
// before any file could mock.module() this path (see comment there).
const actualAssignmentTypeAccess =
  globalThis.__realModules['~/utils/assignment-type-access.server'];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/assignment-deployment.server', () => ({
  createAssignmentDeployedToClasses,
}));
mock.module('~/domain/collaboration/auto-arrange.server', () => ({
  autoArrangeNewAssignment,
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  ...actualAssignmentTypeAccess,
  isAssignmentTypeAvailableForEveryScope,
}));
mock.module('~/domain/assignments/assignment-prompt-attachment.server', () => ({
  ...actualAssignmentPromptAttachment,
  AssignmentPromptAttachmentError,
  assignmentPromptAttachmentRequestTooLarge: () => false,
  deleteAssignmentPromptAttachment,
  uploadAssignmentPromptAttachment,
}));

mock.module('~/domain/assignments/saved-assignments.server', () => ({
  SAVED_ASSIGNMENTS_ENABLED: true,
  saveAssignmentForReuse,
}));

const { action } = await import('./route');
const {
  BASIC_EXIT_TICKET_PROMPT,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_ELABORATION_NOTE,
} = await import('~/domain/assignment-types/exit-ticket');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/utils/assignment-type-access.server',
    () => actualAssignmentTypeAccess
  );
});

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
  kind = null as string | null,
  collaborationSupported = false,
} = {}) {
  prisma.assignmentType.findFirst.mockResolvedValue({
    id,
    systemKey,
    kind,
    collaborationSupported,
  });
}

describe('api.assignments.create', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
    prisma.class.findFirst.mockReset().mockResolvedValue(null);
    prisma.assignmentType.findFirst.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.apHistoryPromptLibraryEntry.findFirst.mockReset();
    createAssignmentDeployedToClasses.mockReset();
    isAssignmentTypeAvailableForEveryScope.mockReset();
    uploadAssignmentPromptAttachment.mockReset();
    deleteAssignmentPromptAttachment.mockReset().mockResolvedValue(undefined);
    saveAssignmentForReuse.mockReset().mockResolvedValue({ id: 'saved-1' });
    autoArrangeNewAssignment
      .mockReset()
      .mockResolvedValue({ arranged: 1, failed: 0 });
    prisma.classAssignment.findMany
      .mockReset()
      .mockResolvedValue([{ id: 'ca-1', classId: 'class-1' }]);
    requireUserId.mockReset();
    requireMembership.mockReset();

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
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'at-1' },
      { organizationId: 'org-1', assignmentTypeId: 'ap-type-1' },
    ]);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    mockAssignmentTypeAvailable();
    isAssignmentTypeAvailableForEveryScope.mockResolvedValue(true);
    prisma.apHistoryPromptLibraryEntry.findFirst.mockResolvedValue(null);
    createAssignmentDeployedToClasses.mockResolvedValue({ id: 'assignment-1' });
    uploadAssignmentPromptAttachment.mockResolvedValue({
      promptAttachmentKey: 'assignment-prompts/file-id/assignment.pdf',
      promptAttachmentName: 'assignment.pdf',
      promptAttachmentSize: 4,
    });
  });

  test('creates one standardized assignment per selected teacher-owned class', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
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
      },
      select: { id: true, systemKey: true, kind: true },
    });
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        title: 'Essay',
        prompt: 'Write the essay.',
        submitForGrade: true,
        pointValue: 100,
        gradingAssistantStrictnessLevel: 'intermediate',
      }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('stores a PDF attachment for assignments created across classes', async () => {
    const form = new FormData();
    form.set('intent', 'create-assignment');
    form.set('assignmentTypeId', 'at-1');
    form.append('classIds', 'class-1');
    form.append('classIds', 'class-2');
    form.set('prompt', 'Reference the attached assignment.');
    form.set(
      'promptAttachment',
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'assignment.pdf', {
        type: 'application/pdf',
      })
    );

    const response = await action({
      request: new Request('https://example.com/api/assignments/create', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    expect((await readBody(response)).success).toBe(true);
    expect(uploadAssignmentPromptAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'assignment.pdf' })
    );
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promptAttachmentKey: 'assignment-prompts/file-id/assignment.pdf',
        promptAttachmentName: 'assignment.pdf',
        promptAttachmentSize: 4,
      }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('persists the selected grading assistant strictness level on created assignments', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        gradingAssistantStrictnessLevel: 'advanced',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gradingAssistantStrictnessLevel: 'advanced',
      }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('defaults assignment grading assistant strictness to intermediate', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gradingAssistantStrictnessLevel: 'intermediate',
      }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('rejects invalid grading assistant strictness levels', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1'],
        prompt: 'Write the essay.',
        gradingAssistantStrictnessLevel: 'punitive',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(responseStatus(response)).toBe(400);
    expect(body).toMatchObject({
      success: false,
      message: 'Grading assistant strictness level is invalid.',
    });
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });

  test('defaults the tutor to enabled when not specified (preserves current behavior)', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({ tutorEnabled: true }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('disables the tutor when the toggle is turned off', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        tutorEnabled: 'false',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({ tutorEnabled: false }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('records how long students have to write', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        writingTimeMinutes: '10',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({ writingTimeMinutes: 10 }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('records no writing time when none is given (preserves current behavior)', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({ writingTimeMinutes: null }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  describe('paragraph type', () => {
    function createWith(fields: Record<string, string>) {
      return action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          prompt: 'Quote the line where the argument turns.',
          title: 'Daily Pages',
          ...fields,
        }),
        params: {},
      } as any);
    }

    test('records the chosen type on a Daily Pages assignment', async () => {
      mockAssignmentTypeAvailable({ kind: 'daily_pages' });

      const body = await readBody(await createWith({ paragraphMode: 'analyze' }));

      expect(body).toMatchObject({ success: true });
      expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paragraphMode: 'analyze' }),
        })
      );
    });

    test('records none when no type is chosen (preserves current behavior)', async () => {
      mockAssignmentTypeAvailable({ kind: 'daily_pages' });

      await createWith({});

      expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paragraphMode: null }),
        })
      );
    });

    test('ignores a type sent for an assignment type that is not Daily Pages', async () => {
      mockAssignmentTypeAvailable({ kind: null });

      await createWith({ paragraphMode: 'analyze' });

      expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paragraphMode: null }),
        })
      );
    });

    test('rejects a type that is not switched on yet', async () => {
      mockAssignmentTypeAvailable({ kind: 'daily_pages' });

      const response = await createWith({ paragraphMode: 'argue' });

      expect(responseStatus(response)).toBe(400);
      expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
    });
  });

  test('rejects a writing time that is not whole minutes', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1'],
        prompt: 'Write the essay.',
        title: 'Essay',
        writingTimeMinutes: 'ten',
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(400);
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
  });

  test('rejects an invalid tutor toggle value', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1'],
        prompt: 'Write the essay.',
        tutorEnabled: 'maybe',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(responseStatus(response)).toBe(400);
    expect(body).toMatchObject({
      success: false,
      message: 'Tutor enabled value is invalid.',
    });
    expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
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
        submitForGrade: false,
        pointValue: null,
      }),
      classIds: ['class-1'],
      deployment: { postAt: null, dueAt: null },
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

  test('rejects assignment types outside the teacher scope or archived', async () => {
    isAssignmentTypeAvailableForEveryScope.mockResolvedValue(false);
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
      },
      select: { id: true, systemKey: true, kind: true },
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
        gradingAssistantStrictnessLevel: 'intermediate',
      }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
  });

  test('carries the tutor toggle through the AP History creation path', async () => {
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
        tutorEnabled: 'false',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith({
      data: expect.objectContaining({ tutorEnabled: false }),
      classIds: ['class-1', 'class-2'],
      deployment: { postAt: null, dueAt: null },
    });
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
  test('keeps the assignment for reuse when the teacher asked it to be saved', async () => {
    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        submitForGrade: 'true',
        pointValue: '50',
        tutorEnabled: 'false',
        saveForReuse: 'true',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(saveAssignmentForReuse).toHaveBeenCalledWith({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'Essay',
      prompt: 'Write the essay.',
      submitForGrade: true,
      pointValue: 50,
      gradingAssistantStrictnessLevel: 'intermediate',
      tutorEnabled: false,
      // Saved alongside the rest of the configuration so reusing this assignment
      // preserves the setting. Solo here because the fixture organization is not
      // in the collaborative-drafts rollout.
      collaborationEnabled: false,
      collaborationGroupMode: 'teacher',
      collaborationGroupSize: null,
    });
  });

  test('does not keep the assignment when the teacher did not ask', async () => {
    await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
      }),
      params: {},
    } as any);

    expect(saveAssignmentForReuse).not.toHaveBeenCalled();
  });

  test('still reports the assignment created when keeping it fails', async () => {
    // The classes already have the assignment by then; a failed save must not
    // read as a failed creation.
    saveAssignmentForReuse.mockRejectedValue(new Error('nope'));

    const response = await action({
      request: requestFor({
        intent: 'create-assignment',
        assignmentTypeId: 'at-1',
        classIds: ['class-1', 'class-2'],
        prompt: 'Write the essay.',
        title: 'Essay',
        saveForReuse: 'true',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(body.message).toBe(
      'Assignment created and applied to classes, but it could not be saved for reuse.'
    );
  });
  describe('collaborative drafts', () => {
    // One class only, so it matches the single classIds entry the helper posts.
    const singleClass = () => {
      prisma.class.findMany.mockResolvedValue([
        { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
      ]);
    };
    // Legacy flag values prove creation no longer depends on assignment type.
    const enablePilot = () => {
      singleClass();
      mockAssignmentTypeAvailable({ collaborationSupported: true });
    };
    const disablePilot = () => {
      singleClass();
      mockAssignmentTypeAvailable({ collaborationSupported: false });
    };

    const createWithCollaboration = (
      extra: Record<string, string | string[]> = {}
    ) =>
      action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1'],
          prompt: 'Write the essay.',
          title: 'Essay',
          collaborationEnabled: 'true',
          collaborationGroupMode: 'teacher',
          collaborationGroupSize: '3',
          ...extra,
        }),
        params: {},
      } as any);

    test('stores the settings when the assignment type is in the pilot', async () => {
      enablePilot();

      const body = await readBody(await createWithCollaboration());

      expect(body.success).toBe(true);
      expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            collaborationEnabled: true,
            collaborationGroupMode: 'teacher',
            collaborationGroupSize: 3,
          }),
        })
      );
    });

    test('rejects collaborative creation when a selected class has no students', async () => {
      enablePilot();
      prisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      const response = await createWithCollaboration();
      const body = await readBody(response);

      expect(responseStatus(response)).toBe(400);
      expect(body.message).toMatch(/add students/i);
      expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
    });

    test('stores collaboration for an assignment type outside the former pilot', async () => {
      disablePilot();

      const body = await readBody(await createWithCollaboration());

      expect(body.success).toBe(true);
      expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            collaborationEnabled: true,
            collaborationGroupMode: 'teacher',
            collaborationGroupSize: 3,
          }),
        })
      );
    });

    test('creates a solo assignment when the form omits the toggle entirely', async () => {
      // Backward compatibility: an older deployed client posts no collaboration
      // fields at all and must keep producing single-author assignments.
      enablePilot();

      await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1'],
          prompt: 'Write the essay.',
          title: 'Essay',
        }),
        params: {},
      } as any);

      expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ collaborationEnabled: false }),
        })
      );
    });

    test('passes the chosen mode through to the assignment', async () => {
      // The sheet posts a mode now; before, every collaborative assignment
      // silently took the parser's default because nothing rendered a picker.
      enablePilot();

      await createWithCollaboration({ collaborationGroupMode: 'random' });

      expect(createAssignmentDeployedToClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ collaborationGroupMode: 'random' }),
        })
      );
    });

    test('arranges groups at creation for the modes that describe one', async () => {
      enablePilot();
      createAssignmentDeployedToClasses.mockResolvedValue({
        id: 'assignment-1',
      });

      await createWithCollaboration({ collaborationGroupMode: 'random' });

      expect(autoArrangeNewAssignment).toHaveBeenCalledWith({
        assignmentId: 'assignment-1',
        mode: 'random',
        groupSize: 3,
      });
    });

    test('whole class drops the posted size', async () => {
      // The group is the roster, so a size would be meaningless -- and the
      // stepper is hidden for this mode, so a posted one is stale.
      enablePilot();
      createAssignmentDeployedToClasses.mockResolvedValue({
        id: 'assignment-1',
      });

      await createWithCollaboration({ collaborationGroupMode: 'whole-class' });

      expect(autoArrangeNewAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'whole-class', groupSize: null })
      );
    });

    test('does not arrange a solo assignment', async () => {
      enablePilot();

      await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1'],
          prompt: 'Write the essay.',
          title: 'Essay',
        }),
        params: {},
      } as any);

      expect(autoArrangeNewAssignment).not.toHaveBeenCalled();
    });

    test('arranges groups for an assignment type outside the former pilot', async () => {
      disablePilot();
      createAssignmentDeployedToClasses.mockResolvedValue({
        id: 'assignment-1',
      });

      await createWithCollaboration({ collaborationGroupMode: 'random' });

      expect(autoArrangeNewAssignment).toHaveBeenCalledWith({
        assignmentId: 'assignment-1',
        mode: 'random',
        groupSize: 3,
      });
    });

    test('sends the teacher on to group setup, because creating is not the end', async () => {
      // The sheet used to just close, leaving a collaborative assignment looking
      // finished while its groups did not exist and no student could see it.
      enablePilot();
      createAssignmentDeployedToClasses.mockResolvedValue({
        id: 'assignment-1',
      });
      prisma.classAssignment.findMany.mockResolvedValue([
        { id: 'ca-1', classId: 'class-1' },
      ]);

      const body = await readBody(await createWithCollaboration());

      expect(body.nextStep).toEqual({
        url: '/app/class-assignments/ca-1/groups',
        classCount: 1,
      });
    });

    test('says plainly that students cannot see it yet', async () => {
      enablePilot();
      createAssignmentDeployedToClasses.mockResolvedValue({
        id: 'assignment-1',
      });
      prisma.classAssignment.findMany.mockResolvedValue([
        { id: 'ca-1', classId: 'class-1' },
      ]);

      const body = await readBody(await createWithCollaboration());

      expect(body.message).toMatch(/cannot see it until you finalize groups/i);
    });

    test('a solo assignment has no next step and keeps its old message', async () => {
      enablePilot();

      const body = await readBody(
        await action({
          request: requestFor({
            intent: 'create-assignment',
            assignmentTypeId: 'at-1',
            classIds: ['class-1'],
            prompt: 'Write the essay.',
            title: 'Essay',
          }),
          params: {},
        } as any)
      );

      expect(body.nextStep).toBeNull();
      expect(body.message).toBe('Assignment created and applied to classes.');
    });

    test('rejects an invalid group size before touching the database', async () => {
      enablePilot();
      createAssignmentDeployedToClasses.mockClear();

      const response = await createWithCollaboration({
        collaborationGroupSize: '99',
      });
      const body = await readBody(response);

      expect(responseStatus(response)).toBe(400);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Group size must be between 2 and 8 students.');
      expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
    });
  });

  describe('exit tickets', () => {
    function mockExitTicketType() {
      mockAssignmentTypeAvailable({
        systemKey: null as any,
        kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
      });
    }

    test('composes the standard prompt for a basic exit ticket', async () => {
      mockExitTicketType();

      const response = await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          exitTicketMode: 'basic',
          title: 'Exit ticket: Tuesday',
        }),
        params: {},
      } as any);

      const body = await readBody(response);
      expect(body.success).toBe(true);

      const data = createAssignmentDeployedToClasses.mock.calls[0][0].data;
      expect(data.prompt).toInclude(BASIC_EXIT_TICKET_PROMPT);
      expect(data.prompt).toInclude(EXIT_TICKET_ELABORATION_NOTE);
      expect(data.exitTicketConfigJson).toEqual({
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
      });
    });

    test('always grades a quick-builder exit ticket in bands', async () => {
      mockExitTicketType();

      await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          exitTicketKind: 'reflection',
          exitTicketMode: 'basic',
          exitTicketGradingBasis: 'completion',
          submitForGrade: 'true',
          pointValue: '10',
          // A stale or hand-made post cannot turn steps back on.
          gradingMode: 'step',
        }),
        params: {},
      } as any);

      const data = createAssignmentDeployedToClasses.mock.calls.at(-1)![0].data;
      expect(data.gradingMode).toBe('bands');
    });

    test('leaves the original builder on whatever mode it posted', async () => {
      mockExitTicketType();

      await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          exitTicketMode: 'basic',
          submitForGrade: 'true',
          pointValue: '10',
          gradingMode: 'step',
        }),
        params: {},
      } as any);

      const data = createAssignmentDeployedToClasses.mock.calls.at(-1)![0].data;
      expect(data.gradingMode).toBe('step');
    });

    test('composes the focused prompt for a specific exit ticket', async () => {
      mockExitTicketType();

      const response = await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          exitTicketMode: 'specific',
          exitTicketFocus: 'ask-question',
          exitTicketAnswerType: 'subjective',
          exitTicketTopic: 'balancing chemical equations',
        }),
        params: {},
      } as any);

      const body = await readBody(response);
      expect(body.success).toBe(true);

      const data = createAssignmentDeployedToClasses.mock.calls[0][0].data;
      expect(data.prompt).toInclude('balancing chemical equations');
      expect(data.prompt).not.toInclude(BASIC_EXIT_TICKET_PROMPT);
      expect(data.exitTicketConfigJson).toEqual({
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific',
        focus: 'ask-question',
        answerType: 'subjective',
        topic: 'balancing chemical equations',
      });
    });

    test('an exit ticket needs no posted prompt', async () => {
      // Every other type rejects a blank prompt. An exit ticket has no prompt
      // field at all, so the same request must succeed here.
      mockExitTicketType();

      const response = await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          exitTicketMode: 'basic',
        }),
        params: {},
      } as any);

      expect((await readBody(response)).success).toBe(true);
    });

    test('never lets a posted prompt become what students read', async () => {
      mockExitTicketType();

      await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          exitTicketMode: 'basic',
          prompt: 'Write about whatever you feel like.',
        }),
        params: {},
      } as any);

      const data = createAssignmentDeployedToClasses.mock.calls[0][0].data;
      expect(data.prompt).not.toInclude('whatever you feel like');
      expect(data.prompt).toInclude(BASIC_EXIT_TICKET_PROMPT);
    });

    test('refuses a specific exit ticket with nothing to be specific about', async () => {
      mockExitTicketType();

      const response = await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          exitTicketMode: 'specific',
          exitTicketFocus: 'explain-concept',
        }),
        params: {},
      } as any);

      const body = await readBody(response);
      expect(body.success).toBe(false);
      expect(responseStatus(response)).toBe(400);
      expect(createAssignmentDeployedToClasses).not.toHaveBeenCalled();
    });

    test('leaves every other assignment type alone', async () => {
      // The exit ticket fields are ignored for a type that is not one, and no
      // config is written, so nothing existing gains a column value.
      mockAssignmentTypeAvailable();

      await action({
        request: requestFor({
          intent: 'create-assignment',
          assignmentTypeId: 'at-1',
          classIds: ['class-1', 'class-2'],
          prompt: 'Write the essay.',
          exitTicketMode: 'specific',
          exitTicketFocus: 'explain-concept',
          exitTicketTopic: 'mitosis',
        }),
        params: {},
      } as any);

      const data = createAssignmentDeployedToClasses.mock.calls[0][0].data;
      expect(data.prompt).toBe('Write the essay.');
      expect(data.exitTicketConfigJson).toBeUndefined();
    });
  });
});
