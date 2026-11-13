/**
 * Brian's slide deck inside a Yawp! lesson (How to Teach It → lesson plans,
 * part 2): the PowerPoint from the course card as a planner deck, slide for
 * slide, pictures included, so the stack can present it, edit it and download
 * it like any deck the planner wrote.
 *
 * Built on "Keep it as is" (Nov 1): `readPptxDeck` reads the slides and the
 * pictures it can show, and `deckFromUpload` lays them out. The only
 * difference is the title: Brian's decks all open on the course banner ("THE
 * CRITICAL ESSAY"), so the deck takes the lesson's name instead.
 */
import { readPptxDeck } from '~/domain/office/pptx-pictures';
import { deckFromUpload, type StoredPicture } from './deck-from-upload';
import type { SlideDeck } from './slide-deck';
import type { YawpLesson } from './yawp-lessons';

/** A picture to store for the teacher's copy: a `LessonPlanUploadPicture` row's columns. */
export type YawpDeckPicture = {
  position: number;
  slideNumbers: number[];
  altText: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  blob: Uint8Array;
};

/** The pictures the deck can show, in deck order. Skipped formats are left out. */
export function yawpDeckPictures(file: Uint8Array): YawpDeckPicture[] {
  return readPptxDeck(file).pictures.flatMap((picture) =>
    picture.bytes && picture.contentType
      ? [
          {
            position: picture.position,
            slideNumbers: picture.slideNumbers,
            altText: picture.altText,
            contentType: picture.contentType,
            byteSize: picture.bytes.byteLength,
            width: picture.width,
            height: picture.height,
            blob: picture.bytes,
          },
        ]
      : []
  );
}

/**
 * Brian's deck as the lesson's deck, with the stored pictures in place, or
 * null when the file cannot be read as a deck.
 */
export function yawpLessonDeck({
  lesson,
  file,
  pictures,
}: {
  lesson: Pick<YawpLesson, 'title' | 'deck'>;
  file: Uint8Array;
  pictures: StoredPicture[];
}): SlideDeck | null {
  const made = deckFromUpload({ name: lesson.deck.fileName, file, pictures });
  if (!made) return null;
  return { ...made.deck, title: lesson.title };
}
