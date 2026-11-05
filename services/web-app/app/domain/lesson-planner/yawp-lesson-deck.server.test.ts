import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { readSlideDeck } from './slide-deck';
import { YAWP_LESSONS } from './yawp-lessons';
import { readYawpDeckFile, storeYawpLessonDeck } from './yawp-lesson-deck.server';

const lesson = YAWP_LESSONS['pre-writing'];
const created: Array<Record<string, unknown>> = [];
const tx = {
  lessonPlanUploadPicture: {
    create: mock(async ({ data }: { data: Record<string, unknown> }) => {
      created.push(data);
      return { id: `pic${String(created.length).padStart(8, '0')}` };
    }),
  },
};

beforeEach(() => {
  created.length = 0;
  tx.lessonPlanUploadPicture.create.mockClear();
});

describe('storing Brian’s deck for a teacher’s copy', () => {
  test('reads the deck from public/ (or the built client)', () => {
    const file = readYawpDeckFile(lesson);
    expect(file).not.toBeNull();
    // A .pptx is a zip archive.
    expect(Buffer.from(file!.subarray(0, 2)).toString('latin1')).toBe('PK');
    expect(readYawpDeckFile({ deck: { href: '/courses/thesis-driven-essay/missing.pptx', fileName: 'x' } })).toBeNull();
  });

  test('stores each picture as the copy’s own, then hands back the deck block', async () => {
    const block = await storeYawpLessonDeck(tx, { lesson, conversationId: 'conv-1', membershipId: 'teacher-1' });
    expect(block).not.toBeNull();
    expect(created.length).toBe(8);
    for (const row of created) {
      expect(row).toMatchObject({ conversationId: 'conv-1', membershipId: 'teacher-1' });
      expect(row.uploadId).toBeUndefined();
      expect(typeof row.position).toBe('number');
      expect(row.blob).toBeInstanceOf(Uint8Array);
    }
    const outcome = readSlideDeck(block!);
    expect(outcome.kind).toBe('deck');
    if (outcome.kind === 'deck') {
      expect(outcome.deck.title).toBe('Pre-writing');
      expect(outcome.deck.slides).toHaveLength(22);
      const pictureSlides = outcome.deck.slides.filter((slide) => slide.layout === 'picture');
      expect(pictureSlides.length).toBe(8);
      // Every picture on a slide is one of the rows just stored (a slide
      // with two pictures shows its largest, so not every row need appear).
      const ids = new Set(created.map((_, index) => `pic${String(index + 1).padStart(8, '0')}`));
      for (const slide of pictureSlides) expect(ids.has(slide.image!)).toBe(true);
    }
  });

  test('no file, no deck: the lesson still opens with its plan', async () => {
    expect(await storeYawpLessonDeck(tx, { lesson, conversationId: 'conv-1', membershipId: 'teacher-1', file: null })).toBeNull();
    expect(tx.lessonPlanUploadPicture.create).not.toHaveBeenCalled();
  });

  test('a file that is not a deck stores nothing', async () => {
    expect(
      await storeYawpLessonDeck(tx, { lesson, conversationId: 'conv-1', membershipId: 'teacher-1', file: new Uint8Array([1, 2, 3]) })
    ).toBeNull();
    expect(tx.lessonPlanUploadPicture.create).not.toHaveBeenCalled();
  });
});
