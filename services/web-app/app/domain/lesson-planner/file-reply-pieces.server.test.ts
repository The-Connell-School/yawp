import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanMaterial: { findUnique: mock(), upsert: mock() },
  lessonPlanMessage: { updateMany: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));
const loadStackOrder = mock();
const writeStackOrder = mock();
mock.module('~/domain/lesson-planner/stack-order.server', () => ({
  loadStackOrder,
  writeStackOrder,
  nextPositionFor: mock(),
  moveStackEntry: mock(),
}));

const { fileReplyPieces } = await import('./file-reply-pieces.server');
afterAll(() => mock.restore());

const REPLY = [
  '## Read aloud (20 min)',
  '',
  'Read the first pages.',
  '',
  '```yawp-material',
  'kind: notes',
  'slot: frame-hist',
  'title: Historical context',
  '---',
  'Vietnam.',
  '```',
  '',
  '## Pair talk (8 min)',
  '',
  'Pairs compare.',
].join('\n');

const message = { id: 'msg-1', createdAt: new Date('2026-10-12T10:00:00Z'), content: REPLY };

beforeEach(() => {
  let n = 0;
  prisma.lessonPlanMaterial.findUnique.mockReset().mockResolvedValue(null);
  prisma.lessonPlanMaterial.upsert.mockReset().mockImplementation(async () => ({ id: `new-${n++}` }));
  prisma.lessonPlanMessage.updateMany.mockReset().mockResolvedValue({ count: 1 });
  loadStackOrder.mockReset().mockResolvedValue(['m:earlier', 'm:new-0', 'm:new-1', 'm:new-2']);
  writeStackOrder.mockReset().mockResolvedValue({ ok: true, order: [] });
});

describe("fileReplyPieces (Brian's run 2, A4)", () => {
  test('files every step and block as its own piece, in reply order, after what was there', async () => {
    const result = await fileReplyPieces({ conversationId: 'plan-1', message });
    const created = prisma.lessonPlanMaterial.upsert.mock.calls.map((call) => call[0].create);
    expect(created.map((item) => item.kind)).toEqual(['step', 'notes', 'step']);
    expect(created.map((item) => item.title)).toEqual([
      'Read aloud (20 min)',
      'Historical context',
      'Pair talk (8 min)',
    ]);
    expect(result.added).toEqual(['msg-1:st', 'msg-1:0', 'msg-1:st:1']);
    expect(writeStackOrder).toHaveBeenCalledWith('plan-1', ['m:earlier', 'm:new-0', 'm:new-1', 'm:new-2']);
  });

  test('leaves a hand-edited piece alone and says so', async () => {
    prisma.lessonPlanMaterial.findUnique.mockImplementation(async ({ where }) =>
      where.conversationId_slot.slot === 'frame-hist'
        ? { sourceMessageId: 'msg-0', blockKey: '0', editedAt: new Date() }
        : null
    );
    const result = await fileReplyPieces({ conversationId: 'plan-1', message });
    expect(prisma.lessonPlanMaterial.upsert).toHaveBeenCalledTimes(2);
    expect(result.skipped).toEqual(['Historical context']);
  });

  test('splitting a kept reply puts its pieces where it was, and unkeeps it', async () => {
    loadStackOrder.mockResolvedValue(['m:before', 'r:msg-1', 'm:after', 'm:new-0', 'm:new-1', 'm:new-2']);
    await fileReplyPieces({ conversationId: 'plan-1', message, replaceKeptReply: true });
    expect(prisma.lessonPlanMessage.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'msg-1', conversationId: 'plan-1' },
      data: { keptAt: null, keptAudience: null, position: null },
    });
    expect(writeStackOrder).toHaveBeenCalledWith('plan-1', [
      'm:before',
      'm:new-0',
      'm:new-1',
      'm:new-2',
      'm:after',
    ]);
  });
});

describe('fileReplyPieces — minutes carried to a block', () => {
  test("an exit ticket under '## Exit ticket (10 min)' is filed with its 10 minutes", async () => {
    await fileReplyPieces({
      conversationId: 'plan-1',
      message: {
        id: 'msg-2',
        createdAt: new Date(),
        content:
          '## Read aloud (20 min)\n\nRead.\n\n## Exit ticket (10 min)\n\n```yawp-exit-ticket\nmode: basic\n```',
      },
    });
    const titles = prisma.lessonPlanMaterial.upsert.mock.calls.map((call) => call[0].create.title);
    expect(titles).toEqual(['Read aloud (20 min)', 'Exit ticket (10 min)']);
  });
});
