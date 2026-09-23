/**
 * The lessons a teacher has already built here, as somewhere to start from.
 *
 * A teacher who taps "Make me an exit ticket" usually has the lesson already —
 * often one they planned in this same tool yesterday. Asking them to describe
 * it again is the retyping the planner exists to remove, and guessing at what
 * it might be is worse. So their own recent lessons are offered by name, and
 * picking one hands the planner the plan itself.
 */
import type { prisma } from '~/utils/db.server';
import { looksLikeLessonPlan } from './suggestions';

type Db = Pick<typeof prisma, 'lessonPlanConversation'>;

export type RecentLesson = { id: string; title: string };

const DEFAULT_LIMIT = 5;
/** Replies read per conversation when deciding whether it holds a plan. */
const REPLIES_CHECKED = 6;
/** A plan is long; the planner needs its objective and steps, not a novel. */
const MAX_PLAN_CHARS = 16_000;

function lessonTitle(row: { title: string; packetTitle: string | null }) {
  return row.packetTitle?.trim() || row.title;
}

export async function loadRecentLessons({
  db,
  membershipId,
  excludeConversationId,
  limit = DEFAULT_LIMIT,
}: {
  db: Db;
  membershipId: string;
  excludeConversationId?: string | null;
  limit?: number;
}): Promise<RecentLesson[]> {
  const rows = await db.lessonPlanConversation.findMany({
    where: {
      membershipId,
      deletedAt: null,
      ...(excludeConversationId ? { id: { not: excludeConversationId } } : {}),
      // A unit's map is an arc, not a lesson with one objective. Its days are
      // lessons of their own and are offered like any other.
      NOT: { unitId: { not: null }, unitDay: null },
    },
    select: {
      id: true,
      title: true,
      packetTitle: true,
      messages: {
        where: { role: 'assistant' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: REPLIES_CHECKED,
        select: { content: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    // Some recent conversations stopped before a plan; read a few extra.
    take: limit * 3,
  });

  return rows
    .filter((row) =>
      row.messages.some((message) => looksLikeLessonPlan(message.content))
    )
    .slice(0, limit)
    .map((row) => ({ id: row.id, title: lessonTitle(row) }));
}

export type MyLesson =
  | {
      id: string;
      title: string;
      plan: string;
      materials: Array<{ kind: string; title: string }>;
    }
  | { error: string };

/** One of this teacher's own lessons: its latest plan and what it has filed. */
export async function readMyLesson({
  db,
  membershipId,
  lessonId,
}: {
  db: Db;
  membershipId: string;
  lessonId: string;
}): Promise<MyLesson> {
  const row = await db.lessonPlanConversation.findFirst({
    where: { id: lessonId, membershipId, deletedAt: null },
    select: {
      id: true,
      title: true,
      packetTitle: true,
      messages: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { role: true, content: true },
      },
      materials: {
        orderBy: [{ sourceCreatedAt: 'asc' }, { blockKey: 'asc' }],
        select: { kind: true, title: true },
      },
    },
  });
  if (!row) {
    return { error: `No lesson of yours with id "${lessonId}".` };
  }

  const plan = row.messages.find(
    (message) =>
      message.role === 'assistant' && looksLikeLessonPlan(message.content)
  );
  if (!plan) {
    return {
      error:
        'That lesson never got as far as a plan. Ask the teacher what it is meant to teach instead.',
    };
  }

  return {
    id: row.id,
    title: lessonTitle(row),
    plan: plan.content.slice(0, MAX_PLAN_CHARS),
    materials: row.materials,
  };
}
