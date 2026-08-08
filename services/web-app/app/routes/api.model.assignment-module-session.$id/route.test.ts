import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesSessionWhere,
  type ScopedSession,
} from '~/utils/testing/where-eval';

const updatedCmsShape = {
  id: 'cms-1',
  instructionsCompleted: 1,
  messages: [],
  assignmentModule: {
    instructions: [
      { id: 'i1', prompt: 'First step', buttons: [], position: 0 },
      { id: 'i2', prompt: 'Second step', buttons: [], position: 1 },
    ],
    assignmentType: { assignmentModules: [{ id: 'scm-1', position: 0 }] },
  },
};

const prisma = {
  user: { findUnique: mock() },
  assignmentModuleSession: {
    findFirst: mock(),
    findUnique: mock(),
    update: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

const baseCms = {
  id: 'cms-1',
  instructionsCompleted: 0,
  assignmentModule: {
    instructions: [
      { id: 'i1', prompt: 'First step', buttons: [] },
      { id: 'i2', prompt: 'Second step', buttons: [] },
    ],
  },
};

describe('api.model.assignment-module-session.$id', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
  });

  test('increment when already finished does not crash', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
      ...baseCms,
      instructionsCompleted: 2,
      assignmentModule: {
        instructions: baseCms.assignmentModule.instructions,
      },
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce(
      updatedCmsShape
    );
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-1',
      instructionsCompleted: 3,
    });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');

    const request = new Request(
      'https://example.com/api/model/assignment-module-session/cms-1',
      { method: 'POST', body: form }
    );

    await action({
      request,
      params: { id: 'cms-1' },
    } as any);

    const updateCall = prisma.assignmentModuleSession.update.mock.calls[0];
    expect(updateCall[0].data.messages).toBeUndefined();
  });

  test('increment with empty instructions does not crash', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
      ...baseCms,
      instructionsCompleted: 0,
      assignmentModule: { instructions: [] },
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce(
      updatedCmsShape
    );
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-1',
      instructionsCompleted: 1,
    });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');

    const request = new Request(
      'https://example.com/api/model/assignment-module-session/cms-1',
      { method: 'POST', body: form }
    );

    await action({
      request,
      params: { id: 'cms-1' },
    } as any);

    const updateCall = prisma.assignmentModuleSession.update.mock.calls[0];
    expect(updateCall[0].data.messages).toBeUndefined();
  });

  test('normal increment creates user and assistant messages', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce(baseCms);
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce(
      updatedCmsShape
    );
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-1',
      instructionsCompleted: 1,
    });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');

    const request = new Request(
      'https://example.com/api/model/assignment-module-session/cms-1',
      { method: 'POST', body: form }
    );

    await action({
      request,
      params: { id: 'cms-1' },
    } as any);

    const updateCall = prisma.assignmentModuleSession.update.mock.calls[0];
    expect(updateCall[0].data.updatedAt).toBeInstanceOf(Date);
    expect(updateCall[0].data.messages).toBeDefined();
    expect(updateCall[0].data.messages.createMany.data).toHaveLength(2);
    expect(updateCall[0].data.messages.createMany.data[0].instructionId).toBe(
      'i1'
    );
    expect(updateCall[0].data.messages.createMany.data[1].instructionId).toBe(
      'i2'
    );
  });

  test('increment advances by instruction position when fetched instructions are unordered', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
      ...baseCms,
      assignmentModule: {
        instructions: [
          { id: 'i2', prompt: 'Second step', buttons: [], position: 2 },
          { id: 'i1', prompt: 'First step', buttons: [], position: 1 },
          { id: 'i3', prompt: 'Third step', buttons: [], position: 3 },
        ],
      },
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce(
      updatedCmsShape
    );
    prisma.assignmentModuleSession.update.mockResolvedValue({
      id: 'cms-1',
      instructionsCompleted: 1,
    });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');
    form.append('incrementButtonText', 'Ready');

    const request = new Request(
      'https://example.com/api/model/assignment-module-session/cms-1',
      { method: 'POST', body: form }
    );

    await action({
      request,
      params: { id: 'cms-1' },
    } as any);

    const updateCall = prisma.assignmentModuleSession.update.mock.calls[0];
    expect(updateCall[0].data.messages.createMany.data).toEqual([
      {
        content: 'Ready',
        agent: 'user',
        instructionId: 'i1',
      },
      {
        content: 'Second step',
        agent: 'assistant',
        instructionId: 'i2',
      },
    ]);
  });
});

describe('api.model.assignment-module-session.$id authorization', () => {
  // Session cms-b hangs off doc-b, owned by student B. Teacher T teaches B's class.
  const SESSION_B: ScopedSession = {
    id: 'cms-b',
    document: {
      id: 'doc-b',
      membershipId: 'profile-b',
      teacherProfileIds: ['profile-teacher'],
    },
  };

  const SESSION_B_ROW = {
    ...baseCms,
    id: 'cms-b',
    messages: [
      { id: 'm-b', agent: 'assistant', content: "Student B's tutor transcript" },
    ],
    assignmentModule: {
      instructions: baseCms.assignmentModule.instructions,
      assignmentType: { assignmentModules: [{ id: 'scm-1', position: 0 }] },
    },
  };

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-b');
    requireMembership.mockResolvedValue({ id: 'profile-b', role: 'STUDENT' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });

    // Stands in for the database: the row comes back only when the query's own where
    // clause selects it, so an unscoped `findUnique({ where: { id } })` really does
    // return student B's session.
    const findSession = async ({ where }: any) =>
      matchesSessionWhere(where, SESSION_B) ? SESSION_B_ROW : null;

    prisma.assignmentModuleSession.findFirst.mockImplementation(findSession);
    prisma.assignmentModuleSession.findUnique.mockImplementation(findSession);
    prisma.assignmentModuleSession.update.mockResolvedValue({ id: 'cms-b' });
  });

  function incrementRequest() {
    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');
    return new Request(
      'https://example.com/api/model/assignment-module-session/cms-b',
      { method: 'POST', body: form }
    );
  }

  test("refuses to advance another student's module session", async () => {
    requireUserId.mockResolvedValue('user-a');
    requireMembership.mockResolvedValue({ id: 'profile-a', role: 'STUDENT' });

    const response = (await action({
      request: incrementRequest(),
      params: { id: 'cms-b' },
    } as any)) as { data: any; init?: { status?: number } };

    expect(response.init?.status).toBe(404);
    expect(JSON.stringify(response.data)).not.toContain(
      "Student B's tutor transcript"
    );
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });

  test('lets the student who owns the session advance it', async () => {
    const response = (await action({
      request: incrementRequest(),
      params: { id: 'cms-b' },
    } as any)) as { data: any; init?: { status?: number } };

    expect(response.init?.status).toBe(200);
    expect(prisma.assignmentModuleSession.update).toHaveBeenCalledTimes(1);
    expect(response.data.cms.id).toBe('cms-b');
  });
});
