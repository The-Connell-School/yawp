import { beforeEach, describe, expect, mock, test } from 'bun:test';

const existingCms = {
  id: 'cms-existing',
  instructionsCompleted: 0,
  messages: [{ id: 'msg-1', agent: 'assistant', content: 'Existing feedback' }],
  assignmentModule: {
    instructions: [{ id: 'instruction-1', prompt: 'Prompt', buttons: [] }],
    assignmentType: { assignmentModules: [{ id: 'module-1', position: 1 }] },
  },
};

const prisma = {
  document: {
    findFirst: mock(),
  },
  assignmentModule: {
    findUnique: mock(),
  },
  assignmentModuleSession: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
    findUnique: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const requireMutableRequest = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest,
}));

const { action } = await import('./route');

function requestFor(body: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    form.append(key, value);
  }
  return new Request(
    'https://example.com/api/model/assignment-module-session',
    {
      method: 'POST',
      body: form,
    }
  );
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

describe('api.model.assignment-module-session', () => {
  beforeEach(() => {
    prisma.document.findFirst.mockReset();
    prisma.assignmentModule.findUnique.mockReset();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.create.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-profile-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
    requireMutableRequest.mockResolvedValue(undefined);
    prisma.document.findFirst.mockResolvedValue({
      membershipId: 'student-profile-1',
      assignmentTypeId: 'type-1',
      assignment: { tutorEnabled: true, apHistorySnapshot: null },
    });
    prisma.assignmentModule.findUnique.mockResolvedValue({
      id: 'module-1',
      title: 'Generic module',
      assignmentTypeId: 'type-1',
      instructions: [
        { id: 'instruction-1', title: 'Write', prompt: 'Prompt' },
      ],
    });
  });

  test('returns an existing document/module session instead of creating a duplicate', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue(existingCms);

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-existing');
    expect(body.created.id).toBe('cms-existing');
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documentId: 'document-1',
          assignmentModuleId: 'module-1',
          deletedAt: null,
        },
      })
    );
  });

  test('touches an existing document module session when it becomes active', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-existing',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue(existingCms);

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-existing');
    expect(prisma.assignmentModuleSession.update).toHaveBeenCalledWith({
      where: { id: 'cms-existing' },
      data: { updatedAt: expect.any(Date) },
    });
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
  });

  test('creates the session when no document/module session exists', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({
      id: 'cms-created',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-created',
    });

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-created');
    expect(prisma.assignmentModuleSession.create).toHaveBeenCalledTimes(1);
  });

  test('touches a newly created document module session when it becomes active', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({
      id: 'cms-created',
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-created',
    });

    const response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.cms.id).toBe('cms-created');
    expect(prisma.assignmentModuleSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
        instructionsCompleted: 0,
        updatedAt: expect.any(Date),
      }),
    });
  });

  test('uses the essay-type-specific APUSH opening message', async () => {
    prisma.document.findFirst.mockResolvedValue({
      membershipId: 'student-profile-1',
      assignmentTypeId: 'type-1',
      assignment: {
        tutorEnabled: true,
        apHistorySnapshot: {
          schemaVersion: 2,
          origin: 'library',
          libraryEntryId: 'apush-leq-market-revolution',
          course: 'apush',
          essayType: 'leq',
          prompt: 'Evaluate the causes of the Market Revolution.',
          period: '1800-1848',
          periodNumber: 4,
          reasoningSkill: 'causation',
          rubric: { rubricId: 'ap-history-leq-2026', totalPoints: 6 },
          timing: { mode: 'untimed', durationMinutes: 40 },
          sources: [],
        },
      },
    });
    prisma.assignmentModule.findUnique.mockResolvedValue({
      id: 'module-1',
      title: 'Read the Documents',
      assignmentTypeId: 'type-1',
      instructions: [
        {
          id: 'instruction-1',
          title: 'Analyze the sources',
          prompt: 'DBQ fallback',
        },
      ],
    });
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    prisma.assignmentModuleSession.create.mockResolvedValue({ id: 'cms-created' });
    prisma.assignmentModuleSession.findUnique.mockResolvedValue({
      ...existingCms,
      id: 'cms-created',
    });

    await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);

    const firstMessage =
      prisma.assignmentModuleSession.create.mock.calls[0]?.[0].data.messages
        .create[0];
    expect(firstMessage.content).toContain('There are no documents on an LEQ');
    expect(firstMessage.content).not.toBe('DBQ fallback');
  });

  test('fails closed for a cross-membership document or mismatched module', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(null);
    let response = await action({
      request: requestFor({
        documentId: 'other-document',
        assignmentModuleId: 'module-1',
      }),
      params: {},
    } as any);
    expect(response.init?.status).toBe(404);

    prisma.document.findFirst.mockResolvedValueOnce({
      membershipId: 'student-profile-1',
      assignmentTypeId: 'type-1',
      assignment: null,
    });
    prisma.assignmentModule.findUnique.mockResolvedValueOnce({
      id: 'wrong-module',
      title: 'Wrong type',
      assignmentTypeId: 'type-2',
      instructions: [],
    });
    response = await action({
      request: requestFor({
        documentId: 'document-1',
        assignmentModuleId: 'wrong-module',
      }),
      params: {},
    } as any);
    expect(response.init?.status).toBe(404);
    expect(prisma.assignmentModuleSession.create).not.toHaveBeenCalled();
  });
});
