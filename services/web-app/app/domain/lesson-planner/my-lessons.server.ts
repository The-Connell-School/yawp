/**
 * The teacher's own saved lessons, for the planner (Brian's review, D3).
 *
 * The planner does not remember earlier conversations. When a teacher says
 * "remember that lesson we made on The Things They Carried", it looks in their
 * library instead: names, filed pieces, and what they asked for.
 * Read-only and scoped to the calling teacher.
 */
import { prisma } from '~/utils/db.server';
import { loadStackContents } from './stack-contents.server';

type Ctx = { membershipId: string; organizationId: string };

const MAX_RESULTS = 10;
const MAX_QUERY_CHARS = 120;
const MAX_FALLBACK_CHARS = 6_000;

export type MyLessonListing = {
  id: string;
  title: string;
  updatedAt: string;
  published: boolean;
  pieces: number;
};

export async function searchMyLessons(
  ctx: Ctx,
  query: string
): Promise<MyLessonListing[]> {
  const q = query.trim().slice(0, MAX_QUERY_CHARS);
  const contains = { contains: q, mode: 'insensitive' as const };
  const rows = await prisma.lessonPlanConversation.findMany({
    where: {
      membershipId: ctx.membershipId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { title: contains },
              { packetTitle: contains },
              { materials: { some: { title: contains } } },
              { messages: { some: { role: 'user', content: contains } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: MAX_RESULTS,
    select: {
      id: true,
      title: true,
      packetTitle: true,
      updatedAt: true,
      publishedAt: true,
      _count: {
        select: {
          materials: true,
          messages: { where: { keptAt: { not: null } } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.packetTitle?.trim() || row.title,
    updatedAt: row.updatedAt.toISOString().slice(0, 10),
    published: Boolean(row.publishedAt),
    pieces: row._count.materials + row._count.messages,
  }));
}

export async function readMyLesson(
  ctx: Ctx,
  id: string
): Promise<
  | {
      id: string;
      title: string;
      pieces: Array<{ kind: string; title: string; content: string }>;
      lastPlan?: string;
    }
  | { error: string }
> {
  const lesson = await prisma.lessonPlanConversation.findFirst({
    where: { id, membershipId: ctx.membershipId, deletedAt: null },
    select: { id: true, title: true, packetTitle: true },
  });
  if (!lesson) {
    return {
      error:
        'No lesson with that id in this teacher’s library. Search again, or ask the teacher for the lesson’s name.',
    };
  }
  const pieces = await loadStackContents(lesson.id);
  // Nothing filed: the last plan the planner wrote is the best account of it.
  const lastPlan = pieces.length
    ? undefined
    : (
        await prisma.lessonPlanMessage.findFirst({
          where: { conversationId: lesson.id, role: 'assistant' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { content: true },
        })
      )?.content.slice(0, MAX_FALLBACK_CHARS);
  return {
    id: lesson.id,
    title: lesson.packetTitle?.trim() || lesson.title,
    pieces,
    ...(lastPlan ? { lastPlan } : {}),
  };
}
