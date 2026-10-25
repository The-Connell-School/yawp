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
import { cleanLessonTitle } from './lesson-title';
export type LibraryLessonInput = {
  id: string;
  title: string;
  packetTitle: string | null;
  updatedAt: Date | string;
  publishedAt: Date | string | null;
  messages: Array<{ keptAudience: string | null }>;
  /** The stack's pieces, filed one by one from the chat. */
  materials?: Array<{ kind: string; audience: string | null }>;
  /** The class the teacher named for the lesson. */
  lessonClassLabel?: string | null;
  /** The unit it belongs to, and which day (null: the unit's planning chat). */
  unit?: { id: string; title: string } | null;
  unitDay?: number | null;
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
  unit: { id: string; title: string } | null;
  unitDay: number | null;
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
 * The class a lesson is for, from the best source it has (Brian's round 4,
 * item 4): the class it came from, the class the teacher named, then for a
 * unit day the class its unit was planned for, then the unit's course (a
 * library tab, named for the class). "My lessons" is not a class.
 */
export function lessonClassName({
  klass,
  label,
  planningLabel,
  courseName,
}: {
  klass: { title: string | null; grade: string | null; period: string | null } | null | undefined;
  label: string | null | undefined;
  planningLabel: string | null | undefined;
  courseName: string | null | undefined;
}): string | null {
  const named = (value: string | null | undefined) => value?.trim() || null;
  return (
    (klass ? classDisplayName(klass) : null) ??
    named(label) ??
    named(planningLabel) ??
    (named(courseName) && courseName!.trim() !== 'My lessons' ? courseName!.trim() : null)
  );
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
    // The deck belongs to the lesson, not its count of pieces (as the run of show).
    const pieces = (lesson.materials ?? []).filter((material) => material.kind !== 'slides');
    return {
      id: lesson.id,
      title: cleanLessonTitle(lesson.packetTitle ?? lesson.title) || 'Lesson plan',
      className: lesson.originClassAssignment
        ? classDisplayName(lesson.originClassAssignment.class)
        : lesson.lessonClassLabel?.trim() || null,
      assignmentTitle: lesson.originClassAssignment?.assignment.title ?? null,
      sectionCount: kept.length + pieces.length,
      handoutCount:
        kept.filter((message) => message.keptAudience === 'student').length +
        pieces.filter((material) => material.audience === 'student').length,
      published: Boolean(lesson.publishedAt),
      updatedAt: asIsoString(lesson.updatedAt),
      unit: lesson.unit ?? null,
      unitDay: lesson.unitDay ?? null,
    };
  });
}

export type UnitFolder = {
  id: string;
  title: string;
  /** The chat that planned the unit, when it has one. */
  planning: LibraryLesson | null;
  days: LibraryLesson[];
};

/**
 * The library as folders and lessons (Brian's run 5, item 1): a unit's days
 * sit together in its folder, in day order, with the chat that planned them;
 * every other lesson stands on its own. Folders keep the order the newest
 * of their lessons has in the list.
 */
export function groupUnits(
  lessons: LibraryLesson[],
  /** Every folder the teacher has, so a new, empty one shows too. */
  allFolders: Array<{ id: string; title: string }> = []
): { units: UnitFolder[]; lessons: LibraryLesson[] } {
  const folders = new Map<string, UnitFolder>(
    allFolders.map((folder) => [folder.id, { id: folder.id, title: folder.title, planning: null, days: [] }])
  );
  const standalone: LibraryLesson[] = [];
  for (const lesson of lessons) {
    if (!lesson.unit) {
      standalone.push(lesson);
      continue;
    }
    const folder = folders.get(lesson.unit.id) ?? { id: lesson.unit.id, title: lesson.unit.title, planning: null, days: [] };
    if (lesson.unitDay == null) folder.planning = folder.planning ?? lesson;
    else folder.days.push(lesson);
    folders.set(lesson.unit.id, folder);
  }
  for (const folder of folders.values()) folder.days.sort((a, b) => (a.unitDay ?? 0) - (b.unitDay ?? 0));
  return { units: [...folders.values()], lessons: standalone };
}

/**
 * Where opening a lesson takes the teacher.
 *
 * This is the whole difference between the two lists. A draft is a
 * conversation still in progress, so it opens in the planner where the work
 * happens. A published lesson is a finished thing to teach from, so it opens
 * on its stack — the outline, the deck, the handouts — with the way back into
 * the conversation still on the page. Without this, "published to my library"
 * handed the teacher back a chat they had already finished having, and the two
 * lists were two names for one behaviour.
 *
 * Publishing does not require keeping anything, so a published lesson can have
 * an empty stack; that one falls back to the conversation, because a page
 * saying "nothing in this stack yet" is a worse landing than the page that
 * could fill it.
 */
export function lessonHref(lesson: {
  id: string;
  published: boolean;
  sectionCount: number;
}): string {
  return lesson.published && lesson.sectionCount > 0
    ? `/app/lesson-planner/${lesson.id}/packet`
    : `/app/lesson-planner?c=${lesson.id}`;
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
