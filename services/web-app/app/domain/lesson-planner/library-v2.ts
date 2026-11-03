/**
 * The library redesign (Oct 24 handoff, Part 2): course › optional group ›
 * unit › lesson. Day numbers come from a lesson's place in its unit and are
 * never stored; counts, drafts and writing share are worked out from the
 * lessons.
 */

export const UNIT_KIND_LABELS = {
  book: 'Book',
  texts: 'Short texts',
  poetry: 'Poetry',
  writing: 'Writing',
  language: 'Language',
  skills: 'Skills',
} as const;
export type UnitKind = keyof typeof UNIT_KIND_LABELS;
export const UNIT_KINDS = Object.keys(UNIT_KIND_LABELS) as UnitKind[];

export function unitKind(stored: string | null | undefined): UnitKind {
  return stored && stored in UNIT_KIND_LABELS ? (stored as UnitKind) : 'texts';
}

export const NO_CLASS_COURSE = 'My lessons';
const PERIOD = /\s*(?:[-·,–]\s*)?\(?\s*(?:period|per\.?|p)\s*\d+\s*\)?\s*$/i;

/** "English 10 · Period 3" is the course "English 10". */
export function courseNameFor(klass: { title: string | null; grade: string | null }): string | null {
  const title = klass.title?.replace(PERIOD, '').trim();
  if (title) return title;
  const grade = klass.grade?.trim();
  if (!grade) return null;
  if (/^\d+$/.test(grade)) return `Grade ${grade}`;
  return /^\d+(st|nd|rd|th)$/i.test(grade) ? `${grade} grade` : grade;
}

export function courseNames(classes: Array<{ title: string | null; grade: string | null }>): string[] {
  const names = new Map<string, string>();
  for (const klass of classes) {
    const name = courseNameFor(klass);
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return names.size ? [...names.values()] : [NO_CLASS_COURSE];
}

/** The course a unit belongs in, from its lessons' classes; else the first. */
export function matchCourse(courses: Array<{ id: string; name: string }>, classNames: Array<string | null>): string | undefined {
  const byName = new Map(courses.map((course) => [course.name.toLowerCase(), course.id]));
  for (const className of classNames) {
    const name = className ? courseNameFor({ title: className, grade: null }) : null;
    const id = name ? byName.get(name.toLowerCase()) : undefined;
    if (id) return id;
  }
  return courses[0]?.id;
}

export function lessonCountLine(lessons: Array<{ set: boolean }>): string {
  if (!lessons.length) return 'No lessons yet';
  const drafts = lessons.filter((lesson) => !lesson.set).length;
  const count = `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`;
  return drafts ? `${count} · ${drafts} draft${drafts === 1 ? '' : 's'}` : count;
}

/** Writing minutes, and their share of class time: the period, or the plan when it runs longer. */
export function writingShare(lessons: Array<{ minutes: number; period: number | null; writingMinutes: number }>): {
  minutes: number;
  percent: number;
} {
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.writingMinutes, 0);
  const time = lessons.reduce((sum, lesson) => sum + Math.max(lesson.period ?? 0, lesson.minutes), 0);
  return { minutes, percent: time ? Math.round((minutes / time) * 100) : 0 };
}

export type BlockGroup = { id: string; title: string; subtitle: string | null; position: number };
export type BlockUnit = { id: string; groupId: string | null; position: number | null };
export type CourseBlock<G extends BlockGroup, U extends BlockUnit> =
  | { kind: 'group'; group: G; units: U[] }
  | { kind: 'unit'; unit: U };

/** Groups and units on their own share one order; a group's units keep theirs. */
export function courseBlocks<G extends BlockGroup, U extends BlockUnit>(groups: G[], units: U[]): CourseBlock<G, U>[] {
  const ids = new Set(groups.map((group) => group.id));
  const byPosition = (a: { position: number | null }, b: { position: number | null }) => (a.position ?? 1e9) - (b.position ?? 1e9);
  const blocks: Array<CourseBlock<G, U> & { at: number }> = [
    ...groups.map((group) => ({
      kind: 'group' as const,
      group,
      units: units.filter((unit) => unit.groupId === group.id).sort(byPosition),
      at: group.position,
    })),
    ...units
      .filter((unit) => !unit.groupId || !ids.has(unit.groupId))
      .map((unit) => ({ kind: 'unit' as const, unit, at: unit.position ?? 1e9 })),
  ];
  // A tie goes to the unit standing on its own.
  return blocks
    .sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'unit' ? -1 : 1))
    .map(({ at: _at, ...block }) => block as CourseBlock<G, U>);
}

/** Where a lesson can go in a unit of these days. Index = the day it becomes, less one. */
export function insertOptions(days: Array<{ title: string }>): Array<{ index: number; label: string }> {
  return [
    { index: 0, label: 'At the start' },
    ...days.slice(0, -1).map((day, at) => ({ index: at + 1, label: `After Day ${at + 1} · ${day.title}` })),
    ...(days.length ? [{ index: days.length, label: `At the end as Day ${days.length + 1}` }] : []),
  ].filter((option, at, all) => all.findIndex((other) => other.index === option.index) === at);
}

export function insertLine(index: number, dayCount: number): string {
  const day = index + 1;
  return index < dayCount ? `It becomes Day ${day}. Day ${day} and the days after it move down one.` : `It becomes Day ${day}.`;
}
