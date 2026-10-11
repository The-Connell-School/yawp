import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanMessage: { findFirst: mock() },
  lessonPlanMaterial: { findFirst: mock(), upsert: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));

const { saveEditedDeck } = await import('./deck-edit.server');

const deck = {
  title: 'Day 1',
  slides: [{ layout: 'title' as const, title: 'A', speakerNotes: 'a' }],
};

beforeEach(() => {
  prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue({
    id: 'msg-1',
    createdAt: new Date('2026-10-11T10:00:00Z'),
  });
  prisma.lessonPlanMaterial.findFirst.mockReset().mockResolvedValue(null);
  prisma.lessonPlanMaterial.upsert.mockReset().mockResolvedValue({ id: 'mat-9' });
});

describe("saveEditedDeck (Brian's review, E2)", () => {
  test('files the edit in the lesson’s one deck slot, marked as edited', async () => {
    const saved = await saveEditedDeck({ conversationId: 'plan-1', deckId: 'msg-1', deck });
    const call = prisma.lessonPlanMaterial.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ conversationId_slot: { conversationId: 'plan-1', slot: 'deck' } });
    expect(call.create.kind).toBe('slides');
    expect(call.create.sourceMessageId).toBe('msg-1');
    expect(call.create.editedAt).toBeInstanceOf(Date);
    expect(call.update.editedAt).toBeInstanceOf(Date);
    expect(call.create.content).toContain('yawp-slides');
    expect(saved).toEqual({ materialId: 'mat-9', sourceMessageId: 'msg-1' });
  });

  test('editing an already-filed deck keeps its source reply', async () => {
    prisma.lessonPlanMessage.findFirst.mockResolvedValue(null);
    prisma.lessonPlanMaterial.findFirst.mockResolvedValue({
      id: 'mat-9',
      sourceMessageId: 'msg-1',
      sourceCreatedAt: new Date('2026-10-11T10:00:00Z'),
    });
    const saved = await saveEditedDeck({ conversationId: 'plan-1', deckId: 'mat-9', deck });
    expect(saved?.sourceMessageId).toBe('msg-1');
  });

  test('refuses a deck that is not in this lesson', async () => {
    prisma.lessonPlanMessage.findFirst.mockResolvedValue(null);
    const saved = await saveEditedDeck({ conversationId: 'plan-1', deckId: 'nope', deck });
    expect(saved).toBeNull();
    expect(prisma.lessonPlanMaterial.upsert).not.toHaveBeenCalled();
  });
});
