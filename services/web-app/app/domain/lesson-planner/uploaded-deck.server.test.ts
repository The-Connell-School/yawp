import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFixture } from '~/domain/office/fixtures';

const prisma = {
  lessonPlanUpload: { updateMany: mock(), findFirst: mock(), update: mock() },
  lessonPlanUploadPicture: { findMany: mock() },
};
const fileReplyPieces = mock();
mock.module('~/utils/db.server', () => ({ prisma }));

const { applyDeckChoice, fileUploadedDeck, keptDeckBlock, withKeptDeck } = await import('./uploaded-deck.server');
const { readSlideDeck } = await import('./slide-deck');

const both = { teach: true, refresh: true };
const source = (extra: Record<string, unknown> = {}) => ({
  id: 'up-1',
  name: 'Thesis.pptx',
  text: 'Slide 1',
  truncated: false,
  keptDeck: true,
  mode: null as string | null,
  deckBuilt: false,
  ...extra,
});
const DECK = '```yawp-slides\n{"title":"T","slides":[{"layout":"title","title":"T","speakerNotes":"n"}]}\n```';

beforeEach(() => {
  prisma.lessonPlanUpload.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prisma.lessonPlanUpload.update.mockReset().mockResolvedValue({});
  prisma.lessonPlanUpload.findFirst.mockReset();
  prisma.lessonPlanUploadPicture.findMany.mockReset().mockResolvedValue([]);
  fileReplyPieces.mockReset().mockResolvedValue({ added: ['m1:deck'], skipped: [] });
});

describe('applyDeckChoice: the teacher’s answer, typed or by button', () => {
  test('“keep it the same” keeps an unanswered deck as is', async () => {
    const sources = [source()];
    await applyDeckChoice({ sources, message: 'keep it the same', choices: both, membershipId: 'teacher-1' });
    expect(sources[0]!.mode).toBe('teach');
    expect(prisma.lessonPlanUpload.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 'up-1', membershipId: 'teacher-1', keptDeck: true, mode: null },
      data: { mode: 'teach' },
    });
  });

  test('an answered deck, a message about something else, or a choice that is off: nothing changes', async () => {
    const answered = [source({ mode: 'refresh' })];
    await applyDeckChoice({ sources: answered, message: 'keep it as is', choices: both, membershipId: 'teacher-1' });
    await applyDeckChoice({ sources: [source()], message: 'Ninth grade, 48 minutes.', choices: both, membershipId: 'teacher-1' });
    await applyDeckChoice({ sources: [source()], message: 'rework it', choices: { teach: true, refresh: false }, membershipId: 'teacher-1' });
    expect(prisma.lessonPlanUpload.updateMany).not.toHaveBeenCalled();
    expect(answered[0]!.mode).toBe('refresh');
  });
});

describe('keptDeckBlock and withKeptDeck: “keep it as is” is in the reply that answers it', () => {
  test('their deck, slide for slide, as a deck block', async () => {
    prisma.lessonPlanUpload.findFirst.mockResolvedValue({ name: 'Thesis.pptx', file: Buffer.from(readFixture('deck-pictures.pptx')) });
    prisma.lessonPlanUploadPicture.findMany.mockResolvedValue([{ id: 'pic1aaaaaaaa', position: 1, width: 40, height: 30 }]);
    const kept = await keptDeckBlock({ sources: [source({ mode: 'teach' })], choices: both, membershipId: 'teacher-1' });
    expect(kept?.uploadId).toBe('up-1');
    const outcome = readSlideDeck(kept!.block);
    expect(outcome.kind === 'deck' ? outcome.deck.slides.map((slide) => slide.title) : []).toEqual([
      'Observe and analyze',
      'What happened',
      'Your turn',
    ]);
  });

  test('only for a deck kept as is that has not been made yet', async () => {
    expect(await keptDeckBlock({ sources: [source({ mode: 'teach', deckBuilt: true })], choices: both, membershipId: 't' })).toBeNull();
    expect(await keptDeckBlock({ sources: [source({ mode: 'refresh' })], choices: both, membershipId: 't' })).toBeNull();
    expect(await keptDeckBlock({ sources: [source({ mode: 'teach' })], choices: { teach: false, refresh: true }, membershipId: 't' })).toBeNull();
    expect(prisma.lessonPlanUpload.findFirst).not.toHaveBeenCalled();
  });

  test('the reply carries their deck, and no other', () => {
    const reply = withKeptDeck(`# The plan\n\nSlides 3–4.\n\n${DECK}`, '```yawp-slides\n{"theirs":true}\n```');
    expect(reply).toContain('Slides 3–4.');
    expect(reply).toContain('{"theirs":true}');
    expect(reply).not.toContain('"title":"T"');
  });
});

describe('fileUploadedDeck: the deck is in the stack before the teacher opens it', () => {
  const message = { id: 'm1', createdAt: new Date(), content: `Plan.\n\n${DECK}` };

  test('a deck kept as is goes into the lesson, and the upload remembers where', async () => {
    await fileUploadedDeck({ conversationId: 'c1', message, sources: [source({ mode: 'teach' })], choices: both, keptUploadId: 'up-1', onStack: false, file: fileReplyPieces });
    expect(fileReplyPieces.mock.calls[0]?.[0]).toMatchObject({ conversationId: 'c1', onlyKeys: ['deck'] });
    expect(prisma.lessonPlanUpload.update.mock.calls[0]?.[0]).toEqual({ where: { id: 'up-1' }, data: { deckMessageId: 'm1' } });
  });

  test('a reworked deck the planner wrote goes in too, once', async () => {
    await fileUploadedDeck({ conversationId: 'c1', message, sources: [source({ mode: 'refresh' })], choices: both, keptUploadId: null, onStack: false, file: fileReplyPieces });
    expect(fileReplyPieces).toHaveBeenCalledTimes(1);
    fileReplyPieces.mockClear();
    await fileUploadedDeck({ conversationId: 'c1', message, sources: [source({ mode: 'refresh', deckBuilt: true })], choices: both, keptUploadId: null, onStack: false, file: fileReplyPieces });
    expect(fileReplyPieces).not.toHaveBeenCalled();
  });

  test('no deck in the reply, or a deck built on the stack (it has its own Add), files nothing', async () => {
    await fileUploadedDeck({ conversationId: 'c1', message: { ...message, content: 'Plan only.' }, sources: [source({ mode: 'refresh' })], choices: both, keptUploadId: null, onStack: false, file: fileReplyPieces });
    await fileUploadedDeck({ conversationId: 'c1', message, sources: [source({ mode: 'refresh' })], choices: both, keptUploadId: null, onStack: true, file: fileReplyPieces });
    expect(fileReplyPieces).not.toHaveBeenCalled();
  });

  test('a hand-edited deck in the lesson is not replaced', async () => {
    fileReplyPieces.mockResolvedValue({ added: [], skipped: ['Old deck'] });
    await fileUploadedDeck({ conversationId: 'c1', message, sources: [source({ mode: 'refresh' })], choices: both, keptUploadId: null, onStack: false, file: fileReplyPieces });
    expect(fileReplyPieces.mock.calls[0]?.[0].confirmReplace).toBeFalsy();
    expect(prisma.lessonPlanUpload.update).not.toHaveBeenCalled();
  });
});
