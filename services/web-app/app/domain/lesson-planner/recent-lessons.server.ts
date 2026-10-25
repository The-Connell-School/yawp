/**
 * Keep planning (Brian's round 4, item 7): the teacher's most recently
 * changed lessons, for the top of the library and the planner home. A unit's
 * planning chat is not a lesson, so it is left out.
 */
import { prisma } from '~/utils/db.server';
import { recentLessonCards, type RecentLesson } from './lesson-location';

export async function recentLessons(membershipId: string, take = 3): Promise<RecentLesson[]> {
  const rows = await prisma.lessonPlanConversation.findMany({
    where: {
      membershipId,
      deletedAt: null,
      messages: { some: {} },
      OR: [{ unitId: null }, { unitDay: { not: null } }],
    },
    orderBy: { updatedAt: 'desc' },
    take,
    select: {
      id: true,
      title: true,
      packetTitle: true,
      updatedAt: true,
      unit: { select: { id: true, title: true, deletedAt: true, course: { select: { name: true } } } },
      _count: { select: { messages: { where: { keptAt: { not: null } } }, materials: true } },
    },
  });
  return recentLessonCards(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      packetTitle: row.packetTitle,
      updatedAt: row.updatedAt,
      sectionCount: row._count.messages + row._count.materials,
      unit:
        row.unit && !row.unit.deletedAt
          ? { id: row.unit.id, title: row.unit.title, courseName: row.unit.course?.name ?? null }
          : null,
    }))
  );
}
