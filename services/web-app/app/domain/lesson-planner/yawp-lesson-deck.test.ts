import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createId } from '@paralleldrive/cuid2';
import { readPptxSlides } from '~/domain/office/pptx';
import { deckPictureIds, fenceSlideDeck, readSlideDeck } from './slide-deck';
import { yawpDeckPictures, yawpLessonDeck } from './yawp-lesson-deck';
import { YAWP_LESSONS, YAWP_LESSON_SLUGS } from './yawp-lessons';

const PUBLIC = join(import.meta.dir, '..', '..', '..', 'public');

const LESSONS = YAWP_LESSON_SLUGS.map((slug) => {
  const lesson = YAWP_LESSONS[slug];
  const file = new Uint8Array(readFileSync(join(PUBLIC, lesson.deck.href)));
  return { slug, lesson, file };
});

describe("Brian's deck as the lesson's deck", () => {
  test.each(LESSONS)('$slug: every picture in the deck is one the planner can show', ({ file }) => {
    const pictures = yawpDeckPictures(file);
    expect(pictures.length).toBeGreaterThanOrEqual(4);
    expect(pictures.map((picture) => picture.position)).toEqual(pictures.map((_, index) => index + 1));
    for (const picture of pictures) {
      expect(['image/png', 'image/jpeg', 'image/gif', 'image/webp']).toContain(picture.contentType);
      expect(picture.byteSize).toBe(picture.blob.byteLength);
      expect(picture.byteSize).toBeGreaterThan(0);
      expect(picture.width).toBeGreaterThan(0);
      expect(picture.height).toBeGreaterThan(0);
      expect(picture.slideNumbers.length).toBeGreaterThan(0);
    }
  });

  test.each(LESSONS)('$slug: builds slide for slide, named for the lesson, with its pictures in place', ({ lesson, file }) => {
    const stored = yawpDeckPictures(file).map((picture) => ({
      id: createId(),
      position: picture.position,
      width: picture.width,
      height: picture.height,
    }));
    const deck = yawpLessonDeck({ lesson, file, pictures: stored });
    expect(deck).not.toBeNull();
    // Not Brian's "THE CRITICAL ESSAY" banner: the lesson's own name.
    expect(deck!.title).toBe(lesson.title);
    expect(deck!.slides).toHaveLength(readPptxSlides(file).length);
    expect(deck!.slides.length).toBeLessThanOrEqual(40);
    // A picture slide where Brian put a picture, and only stored pictures on them.
    const pictureSlides = deck!.slides.filter((slide) => slide.layout === 'picture');
    expect(pictureSlides.length).toBeGreaterThanOrEqual(4);
    const ids = new Set(stored.map((picture) => picture.id));
    for (const id of deckPictureIds(deck!)) expect(ids.has(id)).toBe(true);
    // Every slide keeps notes: Brian's, or a line saying where it came from.
    for (const slide of deck!.slides) expect(slide.speakerNotes?.length).toBeGreaterThan(0);
    // The block the reply carries reads back as the same deck.
    const outcome = readSlideDeck(fenceSlideDeck(deck!));
    expect(outcome.kind).toBe('deck');
    if (outcome.kind === 'deck') expect(outcome.deck.slides).toHaveLength(deck!.slides.length);
  });

  test('a file that is not a deck makes no deck', () => {
    expect(
      yawpLessonDeck({
        lesson: YAWP_LESSONS['pre-writing'],
        file: new Uint8Array([1, 2, 3, 4]),
        pictures: [],
      })
    ).toBeNull();
  });
});
