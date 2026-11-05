import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanConversation: { findFirst: mock(), create: mock() },
  lessonPlanMessage: { create: mock() },
  $transaction: mock(),
};
const fileReplyPieces = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/lesson-planner/file-reply-pieces.server', () => ({ fileReplyPieces }));

const { findYawpLessonCopy, openYawpLesson } = await import('./yawp-lessons.server');
const { YAWP_LESSONS } = await import('./yawp-lessons');

afterAll(() => {
  mock.restore();
});

const scope = { membershipId: 'teacher-1', organizationId: 'org-1' };
const lesson = YAWP_LESSONS['pre-writing'];

beforeEach(() => {
  prisma.lessonPlanConversation.findFirst.mockReset();
  prisma.lessonPlanConversation.create.mockReset().mockResolvedValue({ id: 'conv-new' });
  let messages = 0;
  prisma.lessonPlanMessage.create.mockReset().mockImplementation(async ({ data }: any) => ({
    id: `msg-${++messages}`,
    createdAt: data.createdAt,
    content: data.content,
  }));
  prisma.$transaction.mockReset().mockImplementation(async (run: (tx: typeof prisma) => unknown) => run(prisma));
  fileReplyPieces.mockReset().mockResolvedValue({ added: ['a'], skipped: [] });
});

describe('opening a Yawp! lesson', () => {
  test('finds the teacher’s own copy, the oldest, and never a deleted one', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    expect(await findYawpLessonCopy(scope, 'pre-writing')).toBe('conv-1');
    expect(prisma.lessonPlanConversation.findFirst.mock.calls[0][0]).toEqual({
      where: { membershipId: 'teacher-1', yawpLessonSlug: 'pre-writing', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  });

  test('opens the existing copy rather than making a second one', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    expect(await openYawpLesson(scope, lesson)).toEqual({ conversationId: 'conv-1', created: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(fileReplyPieces).not.toHaveBeenCalled();
  });

  test('the first time, makes the lesson with the request, the plan, and the plan filed as the stack', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);
    expect(await openYawpLesson(scope, lesson)).toEqual({ conversationId: 'conv-new', created: true });

    expect(prisma.lessonPlanConversation.create.mock.calls[0][0].data).toEqual({
      membershipId: 'teacher-1',
      organizationId: 'org-1',
      title: 'Pre-writing',
      periodMinutes: 50,
      yawpLessonSlug: 'pre-writing',
    });

    const [request, reply] = prisma.lessonPlanMessage.create.mock.calls.map((call: any) => call[0].data);
    expect(request).toMatchObject({
      conversationId: 'conv-new',
      role: 'user',
      content: 'Open the Yawp! lesson “Pre-writing” (Lesson 2 of The Thesis-Driven Essay course).',
    });
    expect(reply).toMatchObject({ conversationId: 'conv-new', role: 'assistant', content: lesson.plan });
    // The reply sorts after the request however the rows are read.
    expect(reply.createdAt.getTime() - request.createdAt.getTime()).toBe(1_000);

    expect(fileReplyPieces).toHaveBeenCalledTimes(1);
    expect(fileReplyPieces.mock.calls[0][0]).toEqual({
      conversationId: 'conv-new',
      message: { id: 'msg-2', createdAt: reply.createdAt, content: lesson.plan },
    });
  });
});
