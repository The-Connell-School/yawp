/**
 * Make each day of a multi-day reply its own lesson (Brian's run 5, item 1).
 *
 * The days go in a unit: the conversation's own, or a new one with this
 * conversation as its planning chat (`unitDay` null). Each day gets a
 * conversation of its own, its plan as its first reply, and every piece of
 * that plan already in its stack, so it has its own run of show, stack and
 * lesson plan. A day already made is opened, never made twice.
 */
import { prisma } from '~/utils/db.server';
import { fileReplyPieces } from './file-reply-pieces.server';
import { frameworkFromDays, multiDayTitle, readPlanDays } from './plan-days';

export type DayLesson = {
  day: number;
  title: string;
  conversationId: string;
  created: boolean;
  /** Replacing: the teacher had changed this day, so it was kept. */
  kept?: boolean;
};

export async function makeDayLessons({
  membershipId,
  organizationId,
  conversationId,
  messageId,
  replace = false,
}: {
  membershipId: string;
  organizationId: string;
  conversationId: string;
  messageId: string;
  /**
   * A later version of the week (Brian's run 5, round 2): its days take the
   * place of the ones made before, except a day the teacher has changed.
   */
  replace?: boolean;
}): Promise<{ unitId: string; days: DayLesson[] } | null> {
  const source = await prisma.lessonPlanConversation.findFirst({
    where: { id: conversationId, membershipId, deletedAt: null },
    select: { id: true, title: true, unitId: true, periodMinutes: true, lessonClassLabel: true },
  });
  if (!source) return null;
  const message = await prisma.lessonPlanMessage.findFirst({
    where: { id: messageId, conversationId: source.id, role: 'assistant' },
    select: { content: true },
  });
  const days = message ? readPlanDays(message.content) : [];
  if (!message || days.length < 2) return null;

  const unitId =
    source.unitId ??
    (await prisma.$transaction(async (tx) => {
      const unit = await tx.lessonPlanUnit.create({
        data: { membershipId, organizationId, title: multiDayTitle(message.content, days) },
        select: { id: true },
      });
      // This chat planned the days: it is the unit's planning chat, not a day.
      await tx.lessonPlanConversation.update({ where: { id: source.id }, data: { unitId: unit.id, unitDay: null } });
      return unit.id;
    }));

  const made: DayLesson[] = [];
  for (const day of days) {
    const existing = await prisma.lessonPlanConversation.findFirst({
      where: { unitId, unitDay: day.day, deletedAt: null, membershipId },
      select: { id: true, title: true },
    });
    if (existing && (!replace || (await teacherChanged(existing.id)))) {
      made.push({ day: day.day, title: existing.title, conversationId: existing.id, created: false, kept: replace });
      continue;
    }
    // Replaced: the old version is kept out of sight, never destroyed.
    if (existing) {
      await prisma.lessonPlanConversation.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    }
    const title = `Day ${day.day} — ${day.title}`.slice(0, 120);
    const askedAt = new Date();
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId,
        organizationId,
        title,
        unitId,
        unitDay: day.day,
        periodMinutes: day.minutes ?? source.periodMinutes,
        lessonClassLabel: source.lessonClassLabel,
        messages: {
          create: [
            {
              role: 'user',
              content: `Day ${day.day} of the plan from "${source.title}".`,
              createdAt: askedAt,
            },
            { role: 'assistant', content: day.content, createdAt: new Date(askedAt.getTime() + 1) },
          ],
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, select: { id: true, createdAt: true, content: true } } },
    });
    // The day's steps go straight into its stack, each with its own minutes.
    const reply = conversation.messages[0];
    if (reply) await fileReplyPieces({ conversationId: conversation.id, message: reply });
    made.push({ day: day.day, title, conversationId: conversation.id, created: true });
  }
  // The unit remembers the week's shape and the reply its days came from,
  // once days are made from it.
  if (made.some((day) => day.created)) {
    await prisma.lessonPlanUnit.update({ where: { id: unitId }, data: { framework: frameworkFromDays(days, messageId) } });
  }
  return { unitId, days: made };
}

/**
 * Whether the teacher has worked on a day since it was made: a turn of their
 * own, a piece edited or created in Yawp!, or the lesson set or published.
 */
async function teacherChanged(conversationId: string): Promise<boolean> {
  const [conversation, messages, edited] = await Promise.all([
    prisma.lessonPlanConversation.findUnique({ where: { id: conversationId }, select: { setAt: true, publishedAt: true } }),
    prisma.lessonPlanMessage.count({ where: { conversationId } }),
    prisma.lessonPlanMaterial.count({
      where: { conversationId, OR: [{ editedAt: { not: null } }, { yawpCreatedAt: { not: null } }] },
    }),
  ]);
  return messages > 2 || edited > 0 || Boolean(conversation?.setAt || conversation?.publishedAt);
}

/** The day lessons already made from this conversation's unit, by day. */
export async function dayLessonsFor(conversationId: string, membershipId: string): Promise<DayLesson[]> {
  const source = await prisma.lessonPlanConversation.findFirst({
    where: { id: conversationId, membershipId, deletedAt: null },
    select: { unitId: true, unitDay: true },
  });
  if (!source?.unitId || source.unitDay !== null) return [];
  const rows = await prisma.lessonPlanConversation.findMany({
    where: { unitId: source.unitId, unitDay: { not: null }, deletedAt: null, membershipId },
    orderBy: { unitDay: 'asc' },
    select: { id: true, title: true, unitDay: true },
  });
  return rows.map((row) => ({ day: row.unitDay!, title: row.title, conversationId: row.id, created: false }));
}
