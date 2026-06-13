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
    findUnique: mock(),
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

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
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
    prisma.document.findUnique.mockReset();
    prisma.assignmentModule.findUnique.mockReset();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.create.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    requireUserId.mockReset();

    requireUserId.mockResolvedValue('user-1');
    prisma.document.findUnique.mockResolvedValue({
      membershipId: 'student-profile-1',
    });
    prisma.assignmentModule.findUnique.mockResolvedValue({
      id: 'module-1',
      instructions: [{ id: 'instruction-1', prompt: 'Prompt' }],
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
});
