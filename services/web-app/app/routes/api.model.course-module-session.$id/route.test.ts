import { beforeEach, describe, expect, mock, test } from 'bun:test';

const updatedCmsShape = {
  id: 'cms-1',
  instructionsCompleted: 1,
  messages: [],
  studentCourseModule: {
    instructions: [
      { id: 'i1', prompt: 'First step', buttons: [], position: 0 },
      { id: 'i2', prompt: 'Second step', buttons: [], position: 1 },
    ],
    studentCourse: { studentCourseModules: [{ id: 'scm-1', position: 0 }] },
  },
};

const prisma = {
  studentCourseModuleSession: {
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
  studentCourseModule: {
    instructions: [
      { id: 'i1', prompt: 'First step', buttons: [] },
      { id: 'i2', prompt: 'Second step', buttons: [] },
    ],
  },
};

describe('api.model.course-module-session.$id', () => {
  beforeEach(() => {
    prisma.studentCourseModuleSession.findUnique.mockReset();
    prisma.studentCourseModuleSession.update.mockReset();
    requireUserId.mockReset();

    requireUserId.mockResolvedValue('user-1');
  });

  test('increment when already finished does not crash', async () => {
    prisma.studentCourseModuleSession.findUnique.mockResolvedValueOnce({
      ...baseCms,
      instructionsCompleted: 2,
      studentCourseModule: {
        instructions: baseCms.studentCourseModule.instructions,
      },
    });
    prisma.studentCourseModuleSession.findUnique.mockResolvedValueOnce(
      updatedCmsShape
    );
    prisma.studentCourseModuleSession.update.mockResolvedValue({
      id: 'cms-1',
      instructionsCompleted: 3,
    });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');

    const request = new Request(
      'https://example.com/api/model/course-module-session/cms-1',
      { method: 'POST', body: form }
    );

    await action({
      request,
      params: { id: 'cms-1' },
    } as any);

    const updateCall = prisma.studentCourseModuleSession.update.mock.calls[0];
    expect(updateCall[0].data.messages).toBeUndefined();
  });

  test('increment with empty instructions does not crash', async () => {
    prisma.studentCourseModuleSession.findUnique.mockResolvedValueOnce({
      ...baseCms,
      instructionsCompleted: 0,
      studentCourseModule: { instructions: [] },
    });
    prisma.studentCourseModuleSession.findUnique.mockResolvedValueOnce(
      updatedCmsShape
    );
    prisma.studentCourseModuleSession.update.mockResolvedValue({
      id: 'cms-1',
      instructionsCompleted: 1,
    });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');

    const request = new Request(
      'https://example.com/api/model/course-module-session/cms-1',
      { method: 'POST', body: form }
    );

    await action({
      request,
      params: { id: 'cms-1' },
    } as any);

    const updateCall = prisma.studentCourseModuleSession.update.mock.calls[0];
    expect(updateCall[0].data.messages).toBeUndefined();
  });

  test('normal increment creates user and assistant messages', async () => {
    prisma.studentCourseModuleSession.findUnique.mockResolvedValueOnce(baseCms);
    prisma.studentCourseModuleSession.findUnique.mockResolvedValueOnce(
      updatedCmsShape
    );
    prisma.studentCourseModuleSession.update.mockResolvedValue({
      id: 'cms-1',
      instructionsCompleted: 1,
    });

    const form = new FormData();
    form.append('instructionsCompleted.increment', '1');

    const request = new Request(
      'https://example.com/api/model/course-module-session/cms-1',
      { method: 'POST', body: form }
    );

    await action({
      request,
      params: { id: 'cms-1' },
    } as any);

    const updateCall = prisma.studentCourseModuleSession.update.mock.calls[0];
    expect(updateCall[0].data.messages).toBeDefined();
    expect(updateCall[0].data.messages.createMany.data).toHaveLength(2);
    expect(updateCall[0].data.messages.createMany.data[0].instructionId).toBe(
      'i1'
    );
    expect(updateCall[0].data.messages.createMany.data[1].instructionId).toBe(
      'i2'
    );
  });
});
