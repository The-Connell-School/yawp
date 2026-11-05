/**
 * Rename a lesson, from the stack page or the library (Oct 24 handoff, task
 * 8). One name everywhere: the title the stack, the library and the chat all
 * show. The name it started as is kept for "Started as …", and once the
 * teacher has named it, the planner stops renaming it after its plans.
 */
export const MAX_LESSON_NAME = 120;

export type LessonNameFields = { title: string; packetTitle: string | null; originalTitle: string | null };

export function renameFields(current: LessonNameFields, name: string): LessonNameFields | null {
  const next = name.replace(/\s+/g, ' ').trim().slice(0, MAX_LESSON_NAME);
  if (!next) return null;
  const shown = (current.packetTitle ?? current.title).trim();
  return { title: next, packetTitle: null, originalTitle: current.originalTitle ?? shown };
}

export function startedAsHint(originalTitle: string | null): string {
  return originalTitle
    ? `Started as “${originalTitle}.” Renaming here renames it on the stack page too.`
    : 'Renaming here renames it on the stack page too.';
}
