/**
 * Opening a Yawp! lesson (How to Teach It → lesson plans, Kevin, Nov 5): the
 * teacher's own copy of a catalog lesson, made the first time and found every
 * time after.
 *
 * The copy is an ordinary lesson in the teacher's library: a conversation
 * with the request as the teacher's turn and the plan as the planner's reply,
 * Brian's slide deck in that reply (part 2), all filed into the stack through
 * the same path "Add everything" uses. From there it is theirs to edit,
 * print, present, share and teach.
 */
import { prisma } from '~/utils/db.server';
import { fileReplyPieces } from './file-reply-pieces.server';
import { withKeptDeck } from './uploaded-deck.server';
import { storeYawpLessonDeck } from './yawp-lesson-deck.server';
import { yawpLessonRequest, type YawpLesson } from './yawp-lessons';

export type YawpLessonScope = { membershipId: string; organizationId: string };

/** The teacher's copy of this lesson, if they have one that is not deleted. */
export async function findYawpLessonCopy(
  scope: YawpLessonScope,
  slug: YawpLesson['slug']
): Promise<string | null> {
  const copy = await prisma.lessonPlanConversation.findFirst({
    where: {
      membershipId: scope.membershipId,
      yawpLessonSlug: slug,
      deletedAt: null,
    },
    // The oldest, so two tabs that raced to make one keep opening the same one.
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return copy?.id ?? null;
}

export async function openYawpLesson(
  scope: YawpLessonScope,
  lesson: YawpLesson,
  /** Stores Brian's deck for the copy; replaceable in tests. */
  storeDeck: typeof storeYawpLessonDeck = storeYawpLessonDeck
): Promise<{ conversationId: string; created: boolean }> {
  const existing = await findYawpLessonCopy(scope, lesson.slug);
  if (existing) return { conversationId: existing, created: false };

  const askedAt = new Date();
  // A second later, as the planner's own turns are, so the reply sorts after
  // the request however the rows are read.
  const answeredAt = new Date(askedAt.getTime() + 1_000);
  const { conversationId, reply } = await prisma.$transaction(
    async (tx) => {
      const conversation = await tx.lessonPlanConversation.create({
        data: {
          membershipId: scope.membershipId,
          organizationId: scope.organizationId,
          title: lesson.title,
          periodMinutes: lesson.periodMinutes,
          yawpLessonSlug: lesson.slug,
        },
        select: { id: true },
      });
      // Brian's deck, slide for slide, in the same reply as the plan, the way
      // "Keep it as is" adds a deck to the reply that answers it. Its pictures
      // are the copy's own. With no deck to read, the plan goes in alone.
      const deckBlock = await storeDeck(tx, {
        lesson,
        conversationId: conversation.id,
        membershipId: scope.membershipId,
      });
      await tx.lessonPlanMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: yawpLessonRequest(lesson),
          createdAt: askedAt,
        },
      });
      const reply = await tx.lessonPlanMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: deckBlock
            ? withKeptDeck(lesson.plan, deckBlock)
            : lesson.plan,
          createdAt: answeredAt,
        },
        select: { id: true, createdAt: true, content: true },
      });
      return { conversationId: conversation.id, reply };
    },
    // A deck's pictures (up to a few megabytes) go in with the lesson.
    { timeout: 20_000 }
  );

  await fileReplyPieces({ conversationId, message: reply });
  return { conversationId, created: true };
}
