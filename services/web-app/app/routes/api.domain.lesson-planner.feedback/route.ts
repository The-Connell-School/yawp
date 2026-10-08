/**
 * What teachers think of what the planner made.
 *
 * A verdict on a reply — thumbs up, or thumbs down with what was off — and
 * whether a lesson was actually taught. Without either, the only measure of
 * the planner's quality is whether it generated something, which says nothing
 * about whether a teacher could use it.
 *
 * Separate from the chat action for the same reason the packet is: none of
 * this calls a model, so it must not spend the planner's AI budget.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';

export const LESSON_RATINGS = ['up', 'down'] as const;
export type LessonRating = (typeof LESSON_RATINGS)[number];

const MAX_NOTE_CHARS = 1000;

const POST = z
  .object({
    intent: z.enum(['rate', 'taught', 'untaught']),
    conversationId: z.string().min(1),
    messageId: z.string().min(1).optional(),
    rating: z.enum([...LESSON_RATINGS, 'clear']).optional(),
    note: z.string().max(MAX_NOTE_CHARS).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.intent !== 'rate') return;
    if (!value.messageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messageId'],
        message: 'A reply is required.',
      });
    }
    if (!value.rating) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rating'],
        message: 'A rating is required.',
      });
    }
  });

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const conversation = await prisma.lessonPlanConversation.findFirst({
    where: {
      id: data.conversationId,
      membershipId: access.membership.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!conversation) {
    return dataResponse({ error: 'Conversation not found.' }, { status: 404 });
  }

  if (data.intent === 'taught' || data.intent === 'untaught') {
    const taughtAt = data.intent === 'taught' ? new Date() : null;
    await prisma.lessonPlanConversation.update({
      where: { id: conversation.id },
      data: { taughtAt },
    });
    return dataResponse({ taughtAt: taughtAt?.toISOString() ?? null });
  }

  const rating = data.rating === 'clear' ? null : data.rating!;
  const note = rating ? data.note?.trim() || null : null;
  // Anchored to the conversation proven above, and to assistant replies only:
  // a teacher rates what the planner wrote, never their own turn.
  const { count } = await prisma.lessonPlanMessage.updateMany({
    where: {
      id: data.messageId!,
      conversationId: conversation.id,
      role: 'assistant',
    },
    data: {
      rating,
      ratingNote: note,
      ratedAt: rating ? new Date() : null,
    },
  });
  if (count === 0) {
    return dataResponse({ error: 'Reply not found.' }, { status: 404 });
  }
  return dataResponse({ rating });
}
