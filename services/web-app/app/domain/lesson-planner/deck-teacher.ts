/**
 * The teacher's name on a deck's title slide (Lesson Deck Kit, spec v4.1:
 * "the teacher's name, when the planner has it from the session; otherwise
 * leave the line out").
 *
 * The name comes from the signed-in teacher's account, put on the deck after
 * the planner has written it. The model is never sent the name and never
 * trusted with one: whatever it wrote in `teacher` is replaced, or removed
 * when the session has no name.
 */
import { fenceSlideDeck, readSlideDeck } from './slide-deck';

const MAX_TEACHER_CHARS = 80;

export function withDeckTeacher(reply: string, name: string | null | undefined): string {
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return reply;
  const at = outcome.deck.slides.findIndex((slide) => slide.layout === 'title');
  if (at < 0) return reply;

  const teacher = name?.trim().slice(0, MAX_TEACHER_CHARS) || undefined;
  const current = outcome.deck.slides[at]!;
  if (current.teacher === teacher) return reply;

  const { teacher: _written, ...rest } = current;
  const slides = outcome.deck.slides.map((slide, i) => (i === at ? (teacher ? { ...rest, teacher } : rest) : slide));
  // A function replacement: the deck's JSON can contain `$&` and friends.
  return reply.replace(outcome.block, () => fenceSlideDeck({ ...outcome.deck, slides }));
}
