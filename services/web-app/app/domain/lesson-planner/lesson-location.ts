/**
 * Where a lesson is saved, said on the page (Brian's round 4, item 7): the
 * stack's status, the library control and Keep planning all use this, so a
 * teacher always reads the same place for the same lesson.
 */
import { cleanLessonTitle } from './lesson-title';

export type LessonLocation = {
  /** "English 10 › Age of Reason/Enlightenment", or "Your library › Lessons on their own". */
  label: string;
  href: string;
  inUnit: boolean;
};

export const LIBRARY_HREF = '/app/lesson-planner/library';

export function lessonLocation(unit: { id: string; title: string; courseName: string | null } | null): LessonLocation {
  if (!unit) return { label: 'Your library › Lessons on their own', href: LIBRARY_HREF, inUnit: false };
  return {
    label: `${unit.courseName?.trim() || 'Your library'} › ${unit.title}`,
    href: `${LIBRARY_HREF}/unit/${unit.id}`,
    inUnit: true,
  };
}

/** "just now", "2 min ago", "3 hr ago", then the date. */
export function savedAgo(at: Date | string, now: Date = new Date()): string {
  const when = typeof at === 'string' ? new Date(at) : at;
  const seconds = Math.max(0, (now.getTime() - when.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function savedLine(where: LessonLocation, at: Date | string, now: Date = new Date()): string {
  return `Saved to ${where.label} · ${savedAgo(at, now)}`;
}

/** A lesson as Keep planning reads it from the database. */
export type RecentLessonRow = {
  id: string;
  title: string;
  packetTitle: string | null;
  updatedAt: Date | string;
  /** Kept replies and filed pieces: none means there is no stack to open yet. */
  sectionCount: number;
  unit: { id: string; title: string; courseName: string | null } | null;
};

export type RecentLesson = { id: string; title: string; href: string; where: string; savedAt: string };

/**
 * Keep planning (Brian's round 4, item 7): the lessons a teacher was just
 * working on, where each is saved, and the way back to it. A lesson with
 * anything in it opens on its stack; one without, on its chat.
 */
export function recentLessonCards(rows: RecentLessonRow[]): RecentLesson[] {
  return rows.map((row) => ({
    id: row.id,
    title: cleanLessonTitle(row.packetTitle ?? row.title) || 'Untitled lesson',
    href: row.sectionCount > 0 ? `/app/lesson-planner/${row.id}/packet` : `/app/lesson-planner?c=${row.id}`,
    where: lessonLocation(row.unit).label,
    savedAt: new Date(row.updatedAt).toISOString(),
  }));
}
