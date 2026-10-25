/**
 * The library home and a unit, opened (Oct 24 handoff, Part 2: L1, L2).
 */
import { prisma } from '~/utils/db.server';
import { classDisplayName, lessonHref } from './lesson-library';
import { lessonRuns, type LessonRun } from './lesson-timing.server';
import { courseBlocks, lessonCountLine, unitKind, UNIT_KIND_LABELS, writingShare, type UnitKind } from './library-v2';
import { ensureCourses, type LibraryScope } from './library-v2.server';
import { loadUnitMap } from './lesson-unit.server';

export type UnitTile = {
  id: string;
  title: string;
  kind: UnitKind;
  kindLabel: string;
  courseId: string;
  groupId: string | null;
  lessonLine: string;
  writingPercent: number;
  /** For "It becomes Day 11, after …" (L3). */
  dayCount: number;
  lastTitle: string | null;
};
export type LibraryBlock =
  | { kind: 'group'; id: string; title: string; subtitle: string | null; units: UnitTile[] }
  | { kind: 'unit'; unit: UnitTile };
export type LooseLesson = {
  id: string;
  title: string;
  originalTitle: string | null;
  set: boolean;
  meta: string;
  href: string;
};

const LESSON_SELECT = {
  id: true,
  title: true,
  packetTitle: true,
  originalTitle: true,
  setAt: true,
  publishedAt: true,
  lessonDate: true,
  unitId: true,
  unitDay: true,
  updatedAt: true,
  periodMinutes: true,
  lessonClassLabel: true,
  originClassAssignment: { select: { class: { select: { title: true, grade: true, period: true } } } },
  messages: { where: { keptAt: { not: null } }, select: { id: true } },
  materials: { where: { kind: { not: 'slides' } }, select: { id: true } },
} as const;

function lessonTitle(lesson: { title: string; packetTitle: string | null }) {
  return (lesson.packetTitle ?? lesson.title).trim() || 'Lesson plan';
}

function opens(lesson: { id: string; publishedAt: Date | null; setAt: Date | null; messages: unknown[]; materials: unknown[] }) {
  return lessonHref({
    id: lesson.id,
    published: Boolean(lesson.publishedAt || lesson.setAt),
    sectionCount: lesson.messages.length + lesson.materials.length,
  });
}

function shortDate(date: Date | null): string | null {
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}

export async function loadLibraryHome(scope: LibraryScope, stackV2: boolean) {
  const courses = await ensureCourses(scope);
  const [groups, units, loose] = await Promise.all([
    prisma.lessonPlanUnitGroup.findMany({
      where: { courseId: { in: courses.map((course) => course.id) } },
      select: { id: true, courseId: true, title: true, subtitle: true, position: true },
    }),
    prisma.lessonPlanUnit.findMany({
      where: { membershipId: scope.membershipId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        kind: true,
        courseId: true,
        groupId: true,
        position: true,
        conversations: {
          where: { deletedAt: null, unitDay: { not: null } },
          orderBy: [{ unitDay: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, setAt: true, title: true, packetTitle: true },
        },
      },
    }),
    prisma.lessonPlanConversation.findMany({
      where: { membershipId: scope.membershipId, deletedAt: null, unitId: null },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: LESSON_SELECT,
    }),
  ]);
  const runs = await lessonRuns(units.flatMap((unit) => unit.conversations.map((lesson) => lesson.id)), stackV2);

  const tile = (unit: (typeof units)[number]): UnitTile => {
    const kind = unitKind(unit.kind);
    const share = writingShare(
      unit.conversations
        .map((lesson) => runs[lesson.id])
        .filter((run): run is LessonRun => Boolean(run))
        .map((run) => ({ minutes: run.total, period: run.period, writingMinutes: run.writingMinutes }))
    );
    return {
      id: unit.id,
      title: unit.title,
      kind,
      kindLabel: UNIT_KIND_LABELS[kind],
      courseId: unit.courseId!,
      groupId: unit.groupId,
      lessonLine: lessonCountLine(unit.conversations.map((lesson) => ({ set: Boolean(lesson.setAt) }))),
      writingPercent: share.percent,
      dayCount: unit.conversations.length,
      lastTitle: unit.conversations.length ? lessonTitle(unit.conversations.at(-1)!) : null,
    };
  };

  return {
    courses: courses.map((course) => {
      const courseGroups = groups.filter((group) => group.courseId === course.id);
      const courseUnits = units.filter((unit) => unit.courseId === course.id);
      const blocks: LibraryBlock[] = courseBlocks(courseGroups, courseUnits).map((block) =>
        block.kind === 'group'
          ? { kind: 'group', id: block.group.id, title: block.group.title, subtitle: block.group.subtitle, units: block.units.map(tile) }
          : { kind: 'unit', unit: tile(block.unit) }
      );
      return {
        id: course.id,
        name: course.name,
        blocks,
        groups: courseGroups.sort((a, b) => a.position - b.position).map((group) => ({ id: group.id, title: group.title })),
      };
    }),
    loose: loose.map(
      (lesson): LooseLesson => ({
        id: lesson.id,
        title: lessonTitle(lesson),
        originalTitle: lesson.originalTitle,
        set: Boolean(lesson.setAt),
        meta: [
          lesson.originClassAssignment ? classDisplayName(lesson.originClassAssignment.class) : lesson.lessonClassLabel,
          shortDate(lesson.lessonDate),
          `${lesson.messages.length + lesson.materials.length} pieces`,
        ]
          .filter(Boolean)
          .join(' · '),
        href: opens(lesson),
      })
    ),
    unitOptions: courses.map((course) => ({
      course: course.name,
      units: courseBlocks(
        groups.filter((group) => group.courseId === course.id),
        units.filter((unit) => unit.courseId === course.id)
      ).flatMap((block) => (block.kind === 'group' ? block.units : [block.unit]).map((unit) => ({ id: unit.id, title: unit.title }))),
    })),
  };
}

export type LibraryHome = Awaited<ReturnType<typeof loadLibraryHome>>;

/** One unit, opened: its days, each with its run of show. */
export async function loadUnitView(scope: LibraryScope, unitId: string, stackV2: boolean) {
  await ensureCourses(scope);
  const unit = await prisma.lessonPlanUnit.findFirst({
    where: { id: unitId, membershipId: scope.membershipId, deletedAt: null },
    select: {
      id: true,
      title: true,
      kind: true,
      course: { select: { id: true, name: true } },
      conversations: {
        where: { deletedAt: null },
        orderBy: [{ unitDay: 'asc' }, { createdAt: 'asc' }],
        select: LESSON_SELECT,
      },
    },
  });
  if (!unit) return null;
  const days = unit.conversations.filter((lesson) => lesson.unitDay !== null);
  const planning = unit.conversations.find((lesson) => lesson.unitDay === null) ?? null;
  // The arc the planner wrote, kept with the unit (Kevin, Oct 25, note 4).
  const map = planning ? await loadUnitMap({ db: prisma, unitId: unit.id }) : null;
  const runs = await lessonRuns(days.map((lesson) => lesson.id), stackV2);
  const [loose, units] = await Promise.all([
    prisma.lessonPlanConversation.findMany({
      where: { membershipId: scope.membershipId, deletedAt: null, unitId: null },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, title: true, packetTitle: true },
    }),
    prisma.lessonPlanUnit.findMany({
      where: { membershipId: scope.membershipId, deletedAt: null, id: { not: unit.id } },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, course: { select: { name: true } } },
    }),
  ]);
  const kind = unitKind(unit.kind);
  const lessons = days.map((lesson, index) => {
    const run = runs[lesson.id] ?? null;
    return {
      id: lesson.id,
      day: index + 1,
      title: lessonTitle(lesson),
      originalTitle: lesson.originalTitle,
      set: Boolean(lesson.setAt),
      date: shortDate(lesson.lessonDate),
      href: opens(lesson),
      planHref: `/app/lesson-planner?c=${lesson.id}`,
      showHref: `/show/${lesson.id}?from=library`,
      empty: !lesson.messages.length && !lesson.materials.length,
      run,
    };
  });
  const share = writingShare(
    lessons.flatMap((lesson) => (lesson.run ? [{ minutes: lesson.run.total, period: lesson.run.period, writingMinutes: lesson.run.writingMinutes }] : []))
  );
  const dated = days.map((lesson) => lesson.lessonDate).filter((date): date is Date => Boolean(date));
  const classNames = [
    ...new Set(
      days
        .map((lesson) => (lesson.originClassAssignment ? classDisplayName(lesson.originClassAssignment.class) : lesson.lessonClassLabel))
        .filter(Boolean)
    ),
  ];
  return {
    unit: {
      id: unit.id,
      title: unit.title,
      kind,
      kindLabel: UNIT_KIND_LABELS[kind],
      course: unit.course?.name ?? null,
      line: [
        classNames[0] ?? unit.course?.name ?? null,
        dated.length ? [shortDate(dated[0]!), dated.length > 1 ? shortDate(dated.at(-1)!) : null].filter(Boolean).join(' – ') : null,
        `${lessons.length} day${lessons.length === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' · '),
      drafts: lessons.filter((lesson) => !lesson.set).length,
      writing: share,
      planningHref: planning ? `/app/lesson-planner?c=${planning.id}` : null,
      plan:
        map && planning
          ? {
              subtitle: map.subtitle ?? null,
              endsWith: map.endsWith ?? null,
              days: map.days.map((day) => {
                const built = days.find((lesson) => lesson.unitDay === day.day);
                return {
                  day: day.day,
                  title: day.title,
                  objective: day.objective,
                  reading: day.reading ?? null,
                  builtHref: built ? opens(built) : null,
                  buildHref: built ? null : `/app/lesson-planner?c=${planning.id}&buildDay=${day.day}`,
                };
              }),
            }
          : null,
    },
    lessons,
    loose: loose.map((lesson) => ({ id: lesson.id, title: lessonTitle(lesson) })),
    otherUnits: units.map((other) => ({ id: other.id, title: other.title, course: other.course?.name ?? null })),
  };
}

export type UnitView = NonNullable<Awaited<ReturnType<typeof loadUnitView>>>;
