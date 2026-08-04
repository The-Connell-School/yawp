/**
 * The lesson library: every lesson this teacher has planned, as documents
 * rather than as chat transcripts.
 *
 * A lesson earns a place in the library once something has been kept in its
 * packet; an abandoned conversation is not a lesson. What the teacher scans by
 * is the packet name, the class it was built for, and how much of it is ready.
 */
export type LibraryLessonInput = {
  id: string;
  title: string;
  packetTitle: string | null;
  updatedAt: Date | string;
  messages: Array<{ keptAudience: string | null }>;
  originClassAssignment?: {
    class: {
      title: string | null;
      grade: string | null;
      period: string | null;
    };
    assignment: { title: string | null };
  } | null;
};

export type LibraryLesson = {
  id: string;
  title: string;
  className: string | null;
  assignmentTitle: string | null;
  sectionCount: number;
  handoutCount: number;
  updatedAt: string;
};

export function classDisplayName(klass: {
  title: string | null;
  grade: string | null;
  period: string | null;
}): string | null {
  if (klass.title) return klass.title;
  if (klass.grade && klass.period) {
    return `${klass.grade} · Period ${klass.period}`;
  }
  return klass.grade ?? null;
}

/**
 * Shape saved conversations into library rows, dropping the ones with nothing
 * kept — those are still drafts, and they already live in the planner's rail.
 */
export function buildLessonLibrary(
  lessons: LibraryLessonInput[]
): LibraryLesson[] {
  return lessons
    .map((lesson) => {
      const kept = lesson.messages.filter((message) => message.keptAudience);
      return {
        id: lesson.id,
        title: (lesson.packetTitle ?? lesson.title).trim() || 'Lesson plan',
        className: lesson.originClassAssignment
          ? classDisplayName(lesson.originClassAssignment.class)
          : null,
        assignmentTitle: lesson.originClassAssignment?.assignment.title ?? null,
        sectionCount: kept.length,
        handoutCount: kept.filter(
          (message) => message.keptAudience === 'student'
        ).length,
        updatedAt:
          typeof lesson.updatedAt === 'string'
            ? lesson.updatedAt
            : lesson.updatedAt.toISOString(),
      };
    })
    .filter((lesson) => lesson.sectionCount > 0);
}
