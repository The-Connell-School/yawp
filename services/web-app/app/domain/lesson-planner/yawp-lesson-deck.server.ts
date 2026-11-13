/**
 * Storing Brian's deck for a teacher's copy of a Yawp! lesson (part 2).
 *
 * The pictures become the copy's own `LessonPlanUploadPicture` rows, stored
 * the way a picture added in the slide editor is (the lesson's, no upload):
 * a picture is served only to the teacher it belongs to, so every copy
 * carries its own. The deck block then goes into the planner's reply, and
 * the reply is filed as the lesson's deck.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '@app/prisma';
import { fenceSlideDeck } from './slide-deck';
import { yawpDeckPictures, yawpLessonDeck } from './yawp-lesson-deck';
import type { YawpLesson } from './yawp-lessons';

type Tx = Pick<Prisma.TransactionClient, 'lessonPlanUploadPicture'>;

/**
 * The deck's bytes, from the built client or the source tree, the way the
 * kit's fonts and gallery art are found. Null when the file is not there.
 */
export function readYawpDeckFile(lesson: Pick<YawpLesson, 'deck'>): Uint8Array | null {
  const relative = lesson.deck.href.replace(/^\//, '');
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, relative);
    if (existsSync(path)) return new Uint8Array(readFileSync(path));
  }
  return null;
}

/**
 * Brian's deck for this copy: its pictures stored as the copy's own, and the
 * deck block to add to the planner's reply. Null when there is no deck to
 * add, in which case the lesson opens with its plan alone.
 */
export async function storeYawpLessonDeck(
  tx: Tx,
  {
    lesson,
    conversationId,
    membershipId,
    file = readYawpDeckFile(lesson),
  }: {
    lesson: Pick<YawpLesson, 'title' | 'deck'>;
    conversationId: string;
    membershipId: string;
    /** The deck's bytes; read from disk unless given. */
    file?: Uint8Array | null;
  }
): Promise<string | null> {
  if (!file) return null;
  let pictures;
  try {
    pictures = yawpDeckPictures(file);
  } catch {
    return null;
  }
  const stored = [];
  for (const picture of pictures) {
    const { blob, ...fields } = picture;
    const row = await tx.lessonPlanUploadPicture.create({
      data: { conversationId, membershipId, ...fields, blob: Buffer.from(blob) },
      select: { id: true },
    });
    stored.push({ id: row.id, position: picture.position, width: picture.width, height: picture.height });
  }
  const deck = yawpLessonDeck({ lesson, file, pictures: stored });
  return deck ? fenceSlideDeck(deck) : null;
}
