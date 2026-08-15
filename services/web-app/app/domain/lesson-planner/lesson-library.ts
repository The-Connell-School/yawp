/**
 * The lesson history: every lesson this teacher has planned.
 *
 * This used to be a "library" whose membership nobody chose. A lesson appeared
 * in it because the teacher had clicked "Keep for the lesson" on some reply —
 * an action about what goes in the printed packet, not about what is worth
 * finding again — and once in, it could never leave. Meanwhile the planner's
 * own rail listed everything under the heading "Saved lessons", so two lists
 * disagreed about what "saved" meant.
 *
 * Now there are two, and which one a lesson is in is a decision the teacher
 * makes: drafts they are still working on, and the lessons they have published
 * to their library. Starring tried to do this job and could not — it ranked one
 * list rather than dividing it, so a half-finished lesson and one taught for
 * three years sat in the same place.
 */
export type LibraryLessonInput = {
  id: string;
  title: string;
  packetTitle: string | null;
  updatedAt: Date | string;
  publishedAt: Date | string | null;
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
  published: boolean;
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

function asIsoString(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

/**
 * Shape saved conversations into history rows.
 *
 * Nothing is filtered out: a lesson the teacher started and abandoned is still
 * something they may want to reopen, and hiding it is what made the old
 * library feel like it had lost things.
 */
export function buildLessonLibrary(
  lessons: LibraryLessonInput[]
): LibraryLesson[] {
  return lessons.map((lesson) => {
    const kept = lesson.messages.filter((message) => message.keptAudience);
    return {
      id: lesson.id,
      title: (lesson.packetTitle ?? lesson.title).trim() || 'Lesson plan',
      className: lesson.originClassAssignment
        ? classDisplayName(lesson.originClassAssignment.class)
        : null,
      assignmentTitle: lesson.originClassAssignment?.assignment.title ?? null,
      sectionCount: kept.length,
      handoutCount: kept.filter((message) => message.keptAudience === 'student')
        .length,
      published: Boolean(lesson.publishedAt),
      updatedAt: asIsoString(lesson.updatedAt),
    };
  });
}

/**
 * The history, split in two.
 *
 * Every lesson is in exactly one list. A draft is simply one the teacher has
 * not published yet, which is where all of them start — publishing is the
 * decision, and it can be undone.
 */
export function splitDraftsAndLibrary(lessons: LibraryLesson[]): {
  drafts: LibraryLesson[];
  library: LibraryLesson[];
} {
  return {
    drafts: lessons.filter((lesson) => !lesson.published),
    library: lessons.filter((lesson) => lesson.published),
  };
}
