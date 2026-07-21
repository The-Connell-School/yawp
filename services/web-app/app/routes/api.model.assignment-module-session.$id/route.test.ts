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
    findUnique: mock(),
    update: mock(),
  },
};

const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
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
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    requireUserId.mockReset();

    requireUserId.mockResolvedValue('user-1');
  });

  test('increment when already finished does not crash', async () => {
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
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
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
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
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce(baseCms);
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

  test('AP History advances into the essay-type-specific step bubble', async () => {
    const { buildApHistorySnapshot } = await import(
      '~/domain/ap-history/schema'
    );
    const apHistorySnapshot = buildApHistorySnapshot({
      externalKey: 'apush-leq-market-revolution',
      course: 'apush',
      essayType: 'leq',
      prompt:
        'Evaluate the extent to which the Market Revolution transformed society.',
      period: '1815-1848',
      periodNumber: 4,
      reasoningSkill: 'causation',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 40,
      sources: [],
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      instructionsCompleted: 0,
      assignmentModule: {
        title: 'Drafting',
        instructions: [
          {
            id: 'i1',
            title: 'Introduction',
            prompt: 'Intro',
            buttons: [],
            position: 1,
          },
          {
            id: 'i2',
            title: 'Body Paragraphs',
            // Shared DB stores the default (DBQ) bubble; the LEQ document must
            // advance into the LEQ bubble instead.
            prompt: 'DBQ body-paragraph bubble.',
            buttons: [],
            position: 2,
          },
        ],
      },
      document: { apHistorySnapshot, assignment: null },
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
    const assistantMessage =
      updateCall[0].data.messages.createMany.data[1].content;
    expect(assistantMessage).toContain('Use specific named evidence');
    expect(assistantMessage).not.toBe('DBQ body-paragraph bubble.');
  });

  test('increment advances by instruction position when fetched instructions are unordered', async () => {
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
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
