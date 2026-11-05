/**
 * The library redesign's data and moves (Oct 24 handoff, Part 2). Lessons go
 * in units, units go in groups, groups never nest. Every create, move, group,
 * ungroup, reorder and insert hands back Undo: the library as it was before,
 * and what the move made, so Undo writes the one back and removes the other.
 * Every read and write is scoped to the teacher.
 */
import { createId } from '@paralleldrive/cuid2';
import { z } from 'zod';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { readTeacherNotes } from './teacher-notes';
import { courseBlocks, courseNames, matchCourse, unitKind, type UnitKind } from './library-v2';

export type LibraryScope = { membershipId: string; organizationId: string };
type Tx = Prisma.TransactionClient;

const MAX_NAME = 120;
const name = (value: string, fallback: string) => value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || fallback;

// ── Courses ─────────────────────────────────────────────────────────────

/**
 * The teacher's courses, made from their classes the first time (one per
 * class name; "My lessons" with none), and every unit placed in one.
 */
export async function ensureCourses(scope: LibraryScope) {
  let courses = await prisma.lessonPlanCourse.findMany({
    where: { membershipId: scope.membershipId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });
  const classes = await prisma.class.findMany({
    where: {
      isArchived: false,
      teachers: { some: { id: scope.membershipId } },
      school: { organizationId: scope.organizationId },
    },
    select: { title: true, grade: true },
    orderBy: [{ schoolYear: 'desc' }, { period: 'asc' }],
    take: 100,
  });
  const have = new Set(courses.map((course) => course.name.toLowerCase()));
  const wanted = courseNames(classes).filter((course) => !have.has(course.toLowerCase()));
  // A class added later is a new course; "My lessons" only ever starts a library.
  const adding = courses.length ? wanted.filter((course) => course !== 'My lessons') : wanted;
  if (adding.length) {
    await prisma.lessonPlanCourse.createMany({
      data: adding.map((course, index) => ({ membershipId: scope.membershipId, name: course, position: courses.length + index })),
    });
    courses = await prisma.lessonPlanCourse.findMany({
      where: { membershipId: scope.membershipId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    });
  }

  const loose = await prisma.lessonPlanUnit.findMany({
    where: { membershipId: scope.membershipId, deletedAt: null, courseId: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      conversations: {
        where: { deletedAt: null },
        select: { lessonClassLabel: true, originClassAssignment: { select: { class: { select: { title: true } } } } },
      },
    },
  });
  for (const unit of loose) {
    const courseId = matchCourse(
      courses,
      unit.conversations.map((lesson) => lesson.originClassAssignment?.class.title ?? lesson.lessonClassLabel)
    );
    if (!courseId) continue;
    await prisma.$transaction(async (tx) => {
      const end = await sequenceEnd(tx, courseId);
      await tx.lessonPlanUnit.update({ where: { id: unit.id }, data: { courseId, groupId: null, position: end } });
    });
  }
  return courses;
}

// ── The sequence of a course ────────────────────────────────────────────

type Block = { group: string; units: string[] } | { unit: string };

async function readBlocks(tx: Tx, courseId: string): Promise<Block[]> {
  const [groups, units] = await Promise.all([
    tx.lessonPlanUnitGroup.findMany({ where: { courseId }, select: { id: true, title: true, subtitle: true, position: true } }),
    tx.lessonPlanUnit.findMany({ where: { courseId, deletedAt: null }, select: { id: true, groupId: true, position: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  return courseBlocks(groups, units).map((block) =>
    block.kind === 'group' ? { group: block.group.id, units: block.units.map((unit) => unit.id) } : { unit: block.unit.id }
  );
}

async function writeBlocks(tx: Tx, courseId: string, blocks: Block[]) {
  for (const [index, block] of blocks.entries()) {
    if ('group' in block) {
      await tx.lessonPlanUnitGroup.update({ where: { id: block.group }, data: { position: index } });
      for (const [at, unit] of block.units.entries()) {
        await tx.lessonPlanUnit.update({ where: { id: unit }, data: { courseId, groupId: block.group, position: at } });
      }
    } else {
      await tx.lessonPlanUnit.update({ where: { id: block.unit }, data: { courseId, groupId: null, position: index } });
    }
  }
}

async function sequenceEnd(tx: Tx, courseId: string) {
  return (await readBlocks(tx, courseId)).length;
}

function withoutUnits(blocks: Block[], unitIds: Set<string>): Block[] {
  return blocks
    .filter((block) => !('unit' in block && unitIds.has(block.unit)))
    .map((block) => ('group' in block ? { group: block.group, units: block.units.filter((unit) => !unitIds.has(unit)) } : block));
}

function blockIndexOf(blocks: Block[], unitId: string): number {
  return blocks.findIndex((block) => ('unit' in block ? block.unit === unitId : block.units.includes(unitId)));
}

// ── Undo ────────────────────────────────────────────────────────────────

const SNAPSHOT = z.object({
  groups: z.array(z.object({ id: z.string(), courseId: z.string(), title: z.string(), subtitle: z.string().nullable(), position: z.number() })),
  units: z.array(
    z.object({
      id: z.string(),
      courseId: z.string().nullable(),
      groupId: z.string().nullable(),
      position: z.number().nullable(),
      title: z.string(),
      kind: z.string().nullable(),
    })
  ),
  lessons: z.array(z.object({ id: z.string(), unitId: z.string().nullable(), unitDay: z.number().nullable(), title: z.string() })),
});
export const LIBRARY_UNDO = z.object({
  before: SNAPSHOT,
  made: z.object({ groups: z.array(z.string()), units: z.array(z.string()), lessons: z.array(z.string()) }),
});
export type LibraryUndo = z.infer<typeof LIBRARY_UNDO>;
type Made = LibraryUndo['made'];

async function snapshot(tx: Tx, scope: LibraryScope): Promise<LibraryUndo['before']> {
  const courses = await tx.lessonPlanCourse.findMany({ where: { membershipId: scope.membershipId }, select: { id: true } });
  const [groups, units, lessons] = await Promise.all([
    tx.lessonPlanUnitGroup.findMany({
      where: { courseId: { in: courses.map((course) => course.id) } },
      select: { id: true, courseId: true, title: true, subtitle: true, position: true },
    }),
    tx.lessonPlanUnit.findMany({
      where: { membershipId: scope.membershipId, deletedAt: null },
      select: { id: true, courseId: true, groupId: true, position: true, title: true, kind: true },
    }),
    tx.lessonPlanConversation.findMany({
      where: { membershipId: scope.membershipId, deletedAt: null },
      select: { id: true, unitId: true, unitDay: true, title: true },
    }),
  ]);
  return { groups, units, lessons };
}

/** Runs a move with its Undo: the library before it, and what it made. */
async function withUndo<T>(
  scope: LibraryScope,
  move: (tx: Tx, made: Made) => Promise<T | null>
): Promise<{ result: T; undo: LibraryUndo } | null> {
  return prisma.$transaction(
    async (tx) => {
      const before = await snapshot(tx, scope);
      const made: Made = { groups: [], units: [], lessons: [] };
      const result = await move(tx, made);
      return result === null ? null : { result, undo: { before, made } };
    },
    { timeout: 20_000 }
  );
}

/** Undo: what the move made goes; everything it changed goes back. */
export async function undoLibrary(scope: LibraryScope, undo: LibraryUndo): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const now = await snapshot(tx, scope);
      const courses = new Set(
        (await tx.lessonPlanCourse.findMany({ where: { membershipId: scope.membershipId }, select: { id: true } })).map((course) => course.id)
      );
      const ownLesson = new Set(now.lessons.map((lesson) => lesson.id));
      const ownUnit = new Set(now.units.map((unit) => unit.id));

      if (undo.made.lessons.length) {
        await tx.lessonPlanConversation.updateMany({
          where: { id: { in: undo.made.lessons }, membershipId: scope.membershipId },
          data: { deletedAt: new Date() },
        });
      }
      if (undo.made.units.length) {
        await tx.lessonPlanConversation.updateMany({
          where: { unitId: { in: undo.made.units }, membershipId: scope.membershipId },
          data: { unitId: null, unitDay: null },
        });
        await tx.lessonPlanUnit.updateMany({
          where: { id: { in: undo.made.units }, membershipId: scope.membershipId },
          data: { deletedAt: new Date() },
        });
      }
      if (undo.made.groups.length) {
        await tx.lessonPlanUnitGroup.deleteMany({ where: { id: { in: undo.made.groups }, courseId: { in: [...courses] } } });
      }

      const groupsNow = new Map(now.groups.map((group) => [group.id, group]));
      for (const group of undo.before.groups) {
        if (!courses.has(group.courseId)) continue;
        const current = groupsNow.get(group.id);
        if (!current) await tx.lessonPlanUnitGroup.create({ data: group });
        else if (current.title !== group.title || current.subtitle !== group.subtitle || current.position !== group.position || current.courseId !== group.courseId) {
          await tx.lessonPlanUnitGroup.update({ where: { id: group.id }, data: group });
        }
      }

      const unitsNow = new Map(now.units.map((unit) => [unit.id, unit]));
      const deletedBefore = undo.before.units.filter((unit) => !unitsNow.has(unit.id)).map((unit) => unit.id);
      const revived = new Set(
        (
          await tx.lessonPlanUnit.findMany({
            where: { id: { in: deletedBefore }, membershipId: scope.membershipId },
            select: { id: true },
          })
        ).map((unit) => unit.id)
      );
      for (const unit of undo.before.units) {
        if (!ownUnit.has(unit.id) && !revived.has(unit.id)) continue;
        if (unit.courseId && !courses.has(unit.courseId)) continue;
        const current = unitsNow.get(unit.id);
        const same =
          current &&
          current.courseId === unit.courseId &&
          current.groupId === unit.groupId &&
          current.position === unit.position &&
          current.title === unit.title &&
          current.kind === unit.kind;
        if (!same) {
          await tx.lessonPlanUnit.update({ where: { id: unit.id }, data: { ...unit, id: undefined, deletedAt: null } });
        }
      }

      const lessonsNow = new Map(now.lessons.map((lesson) => [lesson.id, lesson]));
      for (const lesson of undo.before.lessons) {
        if (!ownLesson.has(lesson.id) || undo.made.lessons.includes(lesson.id)) continue;
        const current = lessonsNow.get(lesson.id)!;
        if (current.unitId !== lesson.unitId || current.unitDay !== lesson.unitDay || current.title !== lesson.title) {
          await tx.lessonPlanConversation.update({
            where: { id: lesson.id },
            data: { unitId: lesson.unitId, unitDay: lesson.unitDay, title: lesson.title },
          });
        }
      }
    },
    { timeout: 20_000 }
  );
}

// ── Owned rows ──────────────────────────────────────────────────────────

async function ownedCourse(tx: Tx, scope: LibraryScope, courseId: string) {
  return tx.lessonPlanCourse.findFirst({ where: { id: courseId, membershipId: scope.membershipId }, select: { id: true, name: true } });
}
async function ownedUnit(tx: Tx, scope: LibraryScope, unitId: string) {
  return tx.lessonPlanUnit.findFirst({
    where: { id: unitId, membershipId: scope.membershipId, deletedAt: null },
    select: { id: true, title: true, courseId: true, groupId: true, kind: true },
  });
}
async function ownedGroup(tx: Tx, scope: LibraryScope, groupId: string) {
  return tx.lessonPlanUnitGroup.findFirst({
    where: { id: groupId, course: { membershipId: scope.membershipId } },
    select: { id: true, title: true, courseId: true },
  });
}
async function ownedLesson(tx: Tx, scope: LibraryScope, lessonId: string) {
  return tx.lessonPlanConversation.findFirst({
    where: { id: lessonId, membershipId: scope.membershipId, deletedAt: null },
    select: { id: true, title: true, packetTitle: true, unitId: true },
  });
}

/**
 * A unit's lessons, by day; days 1…n written back. The chat that planned a
 * unit sits in it with no day, and is not one of its lessons.
 */
async function unitDays(tx: Tx, unitId: string): Promise<string[]> {
  const lessons = await tx.lessonPlanConversation.findMany({
    where: { unitId, deletedAt: null, unitDay: { not: null } },
    orderBy: [{ unitDay: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return lessons.map((lesson) => lesson.id);
}
async function writeDays(tx: Tx, unitId: string, lessonIds: string[]) {
  for (const [index, id] of lessonIds.entries()) {
    await tx.lessonPlanConversation.update({ where: { id }, data: { unitId, unitDay: index + 1 } });
  }
}

// ── Units ───────────────────────────────────────────────────────────────

export async function createUnit(
  scope: LibraryScope,
  input: { courseId: string; title: string; kind: string; groupId: string | null }
) {
  return withUndo(scope, async (tx, made) => {
    const course = await ownedCourse(tx, scope, input.courseId);
    if (!course) return null;
    const group = input.groupId ? await ownedGroup(tx, scope, input.groupId) : null;
    if (input.groupId && group?.courseId !== course.id) return null;
    const unit = await tx.lessonPlanUnit.create({
      data: {
        membershipId: scope.membershipId,
        organizationId: scope.organizationId,
        title: name(input.title, 'New unit'),
        kind: unitKind(input.kind),
        courseId: course.id,
      },
      select: { id: true, title: true },
    });
    made.units.push(unit.id);
    const blocks = await readBlocks(tx, course.id);
    const rest = withoutUnits(blocks, new Set([unit.id]));
    const target = group ? rest.find((block) => 'group' in block && block.group === group.id) : null;
    if (target && 'group' in target) target.units.push(unit.id);
    else rest.push({ unit: unit.id });
    await writeBlocks(tx, course.id, rest);
    return { unitId: unit.id, message: `Created ${unit.title}${group ? ` in ${group.title}` : ''}.` };
  });
}

export async function renameUnit(scope: LibraryScope, unitId: string, title: string) {
  return withUndo(scope, async (tx) => {
    const unit = await ownedUnit(tx, scope, unitId);
    if (!unit) return null;
    const next = name(title, unit.title);
    await tx.lessonPlanUnit.update({ where: { id: unit.id }, data: { title: next } });
    return { message: `Renamed to ${next}.` };
  });
}

/** The unit's lessons go to Lessons on their own; the unit goes. */
export async function deleteUnit(scope: LibraryScope, unitId: string) {
  return withUndo(scope, async (tx) => {
    const unit = await ownedUnit(tx, scope, unitId);
    if (!unit) return null;
    await tx.lessonPlanConversation.updateMany({ where: { unitId: unit.id, membershipId: scope.membershipId }, data: { unitId: null, unitDay: null } });
    await tx.lessonPlanUnit.update({ where: { id: unit.id }, data: { deletedAt: new Date() } });
    return { message: `Deleted ${unit.title}. Its lessons are under Lessons on their own.` };
  });
}

export async function duplicateUnit(scope: LibraryScope, unitId: string) {
  return withUndo(scope, async (tx, made) => {
    const unit = await ownedUnit(tx, scope, unitId);
    if (!unit?.courseId) return null;
    const copy = await tx.lessonPlanUnit.create({
      data: {
        membershipId: scope.membershipId,
        organizationId: scope.organizationId,
        title: name(`${unit.title} (copy)`, 'New unit'),
        kind: unit.kind,
        courseId: unit.courseId,
      },
      select: { id: true, title: true },
    });
    made.units.push(copy.id);
    for (const [index, lessonId] of (await unitDays(tx, unit.id)).entries()) {
      const lesson = await copyLesson(tx, lessonId, { unitId: copy.id, unitDay: index + 1 });
      made.lessons.push(lesson);
    }
    // Right after the original, in its group if it has one.
    const blocks = withoutUnits(await readBlocks(tx, unit.courseId), new Set([copy.id]));
    const at = blockIndexOf(blocks, unit.id);
    const block = blocks[at];
    if (block && 'group' in block) block.units.splice(block.units.indexOf(unit.id) + 1, 0, copy.id);
    else blocks.splice(at + 1, 0, { unit: copy.id });
    await writeBlocks(tx, unit.courseId, blocks);
    return { unitId: copy.id, message: `Duplicated as ${copy.title}.` };
  });
}

/** Into a group, at its end; or, with no group, out of it to the end of the course. */
export async function moveUnitsToGroup(scope: LibraryScope, unitIds: string[], groupId: string | null) {
  return withUndo(scope, async (tx) => {
    const units = (await Promise.all(unitIds.map((id) => ownedUnit(tx, scope, id)))).filter((unit) => unit !== null);
    const courseId = units[0]?.courseId;
    if (!courseId || units.some((unit) => unit.courseId !== courseId)) return null;
    const group = groupId ? await ownedGroup(tx, scope, groupId) : null;
    if (groupId && group?.courseId !== courseId) return null;
    const ids = units.map((unit) => unit.id);
    const blocks = withoutUnits(await readBlocks(tx, courseId), new Set(ids));
    if (group) {
      const target = blocks.find((block) => 'group' in block && block.group === group.id);
      if (target && 'group' in target) target.units.push(...ids);
    } else {
      blocks.push(...ids.map((unit) => ({ unit })));
    }
    await writeBlocks(tx, courseId, blocks);
    const what = units.length === 1 ? units[0]!.title : `${units.length} units`;
    return { message: group ? `Moved ${what} to ${group.title}.` : `Took ${what} out of the group.` };
  });
}

// ── Groups ──────────────────────────────────────────────────────────────

/** A new group, where the first of these units was, with them in it. */
export async function groupUnits(scope: LibraryScope, unitIds: string[], title: string) {
  return withUndo(scope, async (tx, made) => {
    const units = (await Promise.all(unitIds.map((id) => ownedUnit(tx, scope, id)))).filter((unit) => unit !== null);
    const courseId = units[0]?.courseId;
    if (!courseId || units.some((unit) => unit.courseId !== courseId)) return null;
    const blocks = await readBlocks(tx, courseId);
    const first = blockIndexOf(blocks, units[0]!.id);
    const ids = units.map((unit) => unit.id);
    const before = blocks.slice(0, first);
    const removedBefore = before.filter((block) => 'unit' in block && ids.includes(block.unit)).length;
    const rest = withoutUnits(blocks, new Set(ids));
    const group = await tx.lessonPlanUnitGroup.create({
      data: { courseId, title: name(title, 'New group'), position: 0 },
      select: { id: true, title: true },
    });
    made.groups.push(group.id);
    // A first unit inside a group: the new group goes just after that group.
    const firstBlock = blocks[first]!;
    const at = first - removedBefore + ('group' in firstBlock ? 1 : 0);
    rest.splice(at, 0, { group: group.id, units: ids });
    await writeBlocks(tx, courseId, rest);
    return { groupId: group.id, message: `Grouped ${ids.length} unit${ids.length === 1 ? '' : 's'} as ${group.title}.` };
  });
}

export async function createGroup(scope: LibraryScope, courseId: string, title: string) {
  return withUndo(scope, async (tx, made) => {
    const course = await ownedCourse(tx, scope, courseId);
    if (!course) return null;
    const group = await tx.lessonPlanUnitGroup.create({
      data: { courseId, title: name(title, 'New group'), position: await sequenceEnd(tx, courseId) },
      select: { id: true, title: true },
    });
    made.groups.push(group.id);
    return { groupId: group.id, message: `Added ${group.title}.` };
  });
}

export async function renameGroup(scope: LibraryScope, groupId: string, title: string, subtitle: string | null) {
  return withUndo(scope, async (tx) => {
    const group = await ownedGroup(tx, scope, groupId);
    if (!group) return null;
    const next = name(title, group.title);
    await tx.lessonPlanUnitGroup.update({
      where: { id: group.id },
      data: { title: next, ...(subtitle !== null ? { subtitle: subtitle.trim().slice(0, MAX_NAME) || null } : {}) },
    });
    return { message: `Renamed to ${next}.` };
  });
}

export async function moveGroup(scope: LibraryScope, groupId: string, direction: 'up' | 'down') {
  return withUndo(scope, async (tx) => {
    const group = await ownedGroup(tx, scope, groupId);
    if (!group) return null;
    const blocks = await readBlocks(tx, group.courseId);
    const at = blocks.findIndex((block) => 'group' in block && block.group === group.id);
    const to = direction === 'up' ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= blocks.length) return { message: `${group.title} is already ${direction === 'up' ? 'first' : 'last'}.` };
    [blocks[at], blocks[to]] = [blocks[to]!, blocks[at]!];
    await writeBlocks(tx, group.courseId, blocks);
    return { message: `Moved ${group.title} ${direction}.` };
  });
}

/** The group goes; its units stay where it was, each on its own. */
export async function ungroup(scope: LibraryScope, groupId: string) {
  return withUndo(scope, async (tx) => {
    const group = await ownedGroup(tx, scope, groupId);
    if (!group) return null;
    const blocks = await readBlocks(tx, group.courseId);
    const at = blocks.findIndex((block) => 'group' in block && block.group === group.id);
    const block = blocks[at];
    if (!block || !('group' in block)) return null;
    blocks.splice(at, 1, ...block.units.map((unit) => ({ unit })));
    await tx.lessonPlanUnit.updateMany({ where: { groupId: group.id }, data: { groupId: null } });
    await tx.lessonPlanUnitGroup.delete({ where: { id: group.id } });
    await writeBlocks(tx, group.courseId, blocks);
    return { message: `Ungrouped ${group.title}. Its units stay in place.` };
  });
}

// ── Lessons ─────────────────────────────────────────────────────────────

function dayMessage(unitTitle: string, day: number, days: number) {
  return day === days ? `Moved to ${unitTitle}. It's the last lesson in the unit.` : `Moved to ${unitTitle}. It's Day ${day}.`;
}

/** Into a unit, at `index` (its end when null); or out of every unit. */
export async function moveLessonTo(scope: LibraryScope, lessonId: string, unitId: string | null, index: number | null = null) {
  return withUndo(scope, async (tx) => {
    const lesson = await ownedLesson(tx, scope, lessonId);
    if (!lesson) return null;
    const from = lesson.unitId;
    if (!unitId) {
      await tx.lessonPlanConversation.update({ where: { id: lesson.id }, data: { unitId: null, unitDay: null } });
      if (from) await writeDays(tx, from, await unitDays(tx, from));
      return { message: 'Took it out of the unit. It’s under Lessons on their own.' };
    }
    const unit = await ownedUnit(tx, scope, unitId);
    if (!unit) return null;
    const days = (await unitDays(tx, unit.id)).filter((id) => id !== lesson.id);
    const at = index === null ? days.length : Math.max(0, Math.min(days.length, index));
    days.splice(at, 0, lesson.id);
    await writeDays(tx, unit.id, days);
    if (from && from !== unit.id) await writeDays(tx, from, await unitDays(tx, from));
    return { message: dayMessage(unit.title, at + 1, days.length), day: at + 1 };
  });
}

/**
 * A new, empty lesson where the teacher chose: in a unit at a day (a new
 * unit, made here, included), or on its own. The planner opens on it.
 */
export async function planLesson(
  scope: LibraryScope,
  input: { unitId: string | null; index: number | null; newUnit?: { courseId: string; title: string } | null }
) {
  return withUndo(scope, async (tx, made) => {
    let unit = input.unitId ? await ownedUnit(tx, scope, input.unitId) : null;
    if (input.unitId && !unit) return null;
    if (input.newUnit) {
      const course = await ownedCourse(tx, scope, input.newUnit.courseId);
      if (!course) return null;
      const created = await tx.lessonPlanUnit.create({
        data: {
          membershipId: scope.membershipId,
          organizationId: scope.organizationId,
          title: name(input.newUnit.title, 'New unit'),
          kind: 'texts',
          courseId: course.id,
          position: await sequenceEnd(tx, course.id),
        },
        select: { id: true, title: true, courseId: true, groupId: true, kind: true },
      });
      made.units.push(created.id);
      unit = created;
    }
    const lesson = await tx.lessonPlanConversation.create({
      data: { membershipId: scope.membershipId, organizationId: scope.organizationId, title: 'New lesson' },
      select: { id: true },
    });
    made.lessons.push(lesson.id);
    if (!unit) return { conversationId: lesson.id, message: 'Started a lesson on its own.' };
    const days = await unitDays(tx, unit.id);
    const at = input.index === null ? days.length : Math.max(0, Math.min(days.length, input.index));
    days.splice(at, 0, lesson.id);
    await writeDays(tx, unit.id, days);
    return { conversationId: lesson.id, day: at + 1, message: `Started Day ${at + 1} of ${unit.title}.` };
  });
}

export async function duplicateLesson(scope: LibraryScope, lessonId: string) {
  return withUndo(scope, async (tx, made) => {
    const lesson = await ownedLesson(tx, scope, lessonId);
    if (!lesson) return null;
    const copy = await copyLesson(tx, lesson.id, { unitId: null, unitDay: null });
    made.lessons.push(copy);
    if (lesson.unitId) {
      const days = (await unitDays(tx, lesson.unitId)).filter((id) => id !== copy);
      days.splice(days.indexOf(lesson.id) + 1, 0, copy);
      await writeDays(tx, lesson.unitId, days);
    }
    return { conversationId: copy, message: 'Duplicated. The copy is right after it.' };
  });
}

/**
 * A copy of a lesson: its chat, its stack and its notes, as a draft, with
 * no assignments, share links or date (those belong to the original).
 */
async function copyLesson(tx: Tx, lessonId: string, place: { unitId: string | null; unitDay: number | null }): Promise<string> {
  const source = await tx.lessonPlanConversation.findUniqueOrThrow({
    where: { id: lessonId },
    include: { messages: true, materials: true },
  });
  const id = createId();
  const messageIds = new Map(source.messages.map((message) => [message.id, createId()]));
  const materialIds = new Map(source.materials.map((material) => [material.id, createId()]));
  const title = name(`${source.packetTitle ?? source.title} (copy)`, 'New lesson');
  const notes = readTeacherNotes(source.teacherNotes);
  await tx.lessonPlanConversation.create({
    data: {
      id,
      membershipId: source.membershipId,
      organizationId: source.organizationId,
      title,
      packetTitle: source.packetTitle ? title : null,
      periodMinutes: source.periodMinutes,
      lessonClassLabel: source.lessonClassLabel,
      planSummary: source.planSummary ?? undefined,
      planSummaryKey: source.planSummaryKey,
      unitId: place.unitId,
      unitDay: place.unitDay,
      teacherNotes: Object.fromEntries(
        Object.entries(notes).map(([key, text]) => [messageIds.get(key) ?? materialIds.get(key) ?? key, text])
      ),
    },
  });
  if (source.messages.length) {
    await tx.lessonPlanMessage.createMany({
      data: source.messages.map((message) => ({
        id: messageIds.get(message.id)!,
        conversationId: id,
        createdAt: message.createdAt,
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls ?? undefined,
        keptAt: message.keptAt,
        keptAudience: message.keptAudience,
        keptTitle: message.keptTitle,
        position: message.position,
        surface: message.surface,
      })),
    });
  }
  if (source.materials.length) {
    await tx.lessonPlanMaterial.createMany({
      data: source.materials.map(({ id: materialId, conversationId: _c, sourceMessageId, yawpHref: _h, yawpCreatedAt: _a, yawpAssignmentId: _y, ...material }) => ({
        ...material,
        id: materialIds.get(materialId)!,
        conversationId: id,
        sourceMessageId: messageIds.get(sourceMessageId) ?? sourceMessageId,
      })),
    });
  }
  return id;
}

export type { UnitKind };
