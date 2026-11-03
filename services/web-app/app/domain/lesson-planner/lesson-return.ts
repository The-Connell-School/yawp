/**
 * Close takes the teacher back to where they opened it (Brian's run 6, item
 * 3): a deck opened from the chat closes to the chat, one opened from the
 * stack closes to the stack. Every opener says where it is with `?from=`, and
 * every viewer's Close or Back reads it.
 */
export const LESSON_PLACES = ['chat', 'stack', 'show'] as const;
export type LessonPlace = (typeof LESSON_PLACES)[number];

export const FROM_PARAM = 'from';
/** The assignment page's older name for the same thing (Brian's run 4). */
const LEGACY_BACK_PARAM = 'back';

export function readLessonPlace(value: string | null | undefined, fallback: LessonPlace): LessonPlace {
  return (LESSON_PLACES as readonly string[]).includes(value ?? '') ? (value as LessonPlace) : fallback;
}

export function lessonPlaceHref(conversationId: string, place: LessonPlace): string {
  const id = encodeURIComponent(conversationId);
  if (place === 'stack') return `/app/lesson-planner/${id}/packet`;
  if (place === 'show') return `/show/${id}`;
  return `/app/lesson-planner?c=${id}`;
}

export function withLessonPlace(href: string, place: LessonPlace): string {
  const url = new URL(href, 'http://local');
  url.searchParams.set(FROM_PARAM, place);
  return `${url.pathname}?${url.searchParams}`;
}

/** Where a viewer's Close goes, from its own URL. Old links keep `fallback`. */
export function closeHref(conversationId: string, pageUrl: string, fallback: LessonPlace): string {
  const params = new URL(pageUrl, 'http://local').searchParams;
  const place = readLessonPlace(params.get(FROM_PARAM) ?? params.get(LEGACY_BACK_PARAM), fallback);
  return lessonPlaceHref(conversationId, place);
}
