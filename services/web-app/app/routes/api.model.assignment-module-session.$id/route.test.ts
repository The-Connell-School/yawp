import { beforeEach, describe, expect, mock, test } from 'bun:test';

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
  assignmentModuleSession: {
    findFirst: mock(),
    findUnique: mock(),
    update: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();
const requireMutableRequest = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest,
}));

const { action } = await import('./route');

const baseCms = {
  id: 'cms-1',
  instructionsCompleted: 0,
  assignmentModule: {
    title: 'Generic module',
    instructions: [
      { id: 'i1', title: 'First', prompt: 'First step', buttons: [] },
      { id: 'i2', title: 'Second', prompt: 'Second step', buttons: [] },
    ],
  },
  document: { assignment: { tutorEnabled: true, apHistorySnapshot: null } },
};

describe('api.model.assignment-module-session.$id', () => {
  beforeEach(() => {
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
    requireMutableRequest.mockResolvedValue(undefined);
  });

  test('increment when already finished does not crash', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
      ...baseCms,
      instructionsCompleted: 2,
      assignmentModule: {
        title: 'Generic module',
        instructions: baseCms.assignmentModule.instructions,
      },
      document: baseCms.document,
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
      assignmentModule: { title: 'Generic module', instructions: [] },
      document: baseCms.document,
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
        title: 'Generic module',
        instructions: [
          { id: 'i2', title: 'Second', prompt: 'Second step', buttons: [], position: 2 },
          { id: 'i1', title: 'First', prompt: 'First step', buttons: [], position: 1 },
          { id: 'i3', title: 'Third', prompt: 'Third step', buttons: [], position: 3 },
        ],
      },
      document: baseCms.document,
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

  test('uses the APUSH essay-type variant when advancing a step', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
      ...baseCms,
      assignmentModule: {
        title: 'Drafting',
        instructions: [
          { id: 'i1', title: 'Introduction', prompt: 'Intro', buttons: [], position: 1 },
          {
            id: 'i2',
            title: 'Body Paragraphs',
            prompt: 'DBQ fallback',
            buttons: [],
            position: 2,
          },
        ],
      },
      document: {
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
      },
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce(updatedCmsShape);
    prisma.assignmentModuleSession.update.mockResolvedValue({ id: 'cms-1' });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');
    await action({
      request: new Request(
        'https://example.com/api/model/assignment-module-session/cms-1',
        { method: 'POST', body: form },
      ),
      params: { id: 'cms-1' },
    } as any);

    const messages =
      prisma.assignmentModuleSession.update.mock.calls[0]?.[0].data.messages
        .createMany.data;
    expect(messages[1].content).toContain('specific named evidence');
    expect(messages[1].content).not.toBe('DBQ fallback');
  });

  test('does not mutate cross-membership or tutor-disabled sessions', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce(null);
    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');
    let response = await action({
      request: new Request(
        'https://example.com/api/model/assignment-module-session/other',
        { method: 'POST', body: form },
      ),
      params: { id: 'other' },
    } as any);
    expect(response.init?.status).toBe(404);

    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
      ...baseCms,
      document: {
        assignment: { tutorEnabled: false, apHistorySnapshot: null },
      },
    });
    response = await action({
      request: new Request(
        'https://example.com/api/model/assignment-module-session/cms-1',
        { method: 'POST', body: form },
      ),
      params: { id: 'cms-1' },
    } as any);
    expect(response.init?.status).toBe(403);
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });
});
