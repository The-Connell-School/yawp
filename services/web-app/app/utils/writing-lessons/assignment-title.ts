import { getQuickWritingLessonBySlug } from './static-lessons.server';

const GENERIC_TITLE = 'Writing Fundamentals Practice';

/**
 * The title to show for a writing-practice assignment. Teachers can name an
 * assignment, but most (especially one-click "assign this lesson") have no
 * title — in that case we surface the lesson(s) actually assigned so a student
 * sees "Topic Sentences" rather than a generic "Writing Fundamentals Practice"
 * on every card. Falls back to the generic label only when nothing resolves.
 */
export function writingPracticeAssignmentTitle(assignment: {
  title: string | null;
  lessonSlugs: string[];
}): string {
  const explicit = assignment.title?.trim();
  if (explicit) return explicit;

  const lessonTitles = assignment.lessonSlugs
    .map((slug) => getQuickWritingLessonBySlug(slug)?.title)
    .filter((title): title is string => Boolean(title));

  if (lessonTitles.length === 0) return GENERIC_TITLE;
  if (lessonTitles.length === 1) return lessonTitles[0];
  if (lessonTitles.length === 2) {
    return `${lessonTitles[0]} & ${lessonTitles[1]}`;
  }
  const remaining = lessonTitles.length - 2;
  return `${lessonTitles[0]}, ${lessonTitles[1]} & ${remaining} more`;
}
