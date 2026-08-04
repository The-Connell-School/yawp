/**
 * Packet edits: which replies the teacher is keeping, who each printed section
 * is for, and what the finished document is called.
 *
 * Deliberately separate from the chat action — none of this calls a model, so
 * it must not consume the planner's AI admission budget or its request
 * deadline. Marking a section should feel instant.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { PACKET_AUDIENCES } from '~/domain/lesson-planner/lesson-packet';

const MAX_PACKET_TITLE_CHARS = 120;
const MAX_SECTION_TITLE_CHARS = 120;

const POST = z
  .object({
    intent: z.enum(['keep', 'drop', 'rename', 'rename-section']),
    conversationId: z.string().min(1),
    messageId: z.string().min(1).optional(),
    audience: z.enum(PACKET_AUDIENCES).optional(),
    packetTitle: z.string().max(MAX_PACKET_TITLE_CHARS).optional(),
    sectionTitle: z.string().max(MAX_SECTION_TITLE_CHARS).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.intent === 'keep' ||
        value.intent === 'drop' ||
        value.intent === 'rename-section') &&
      !value.messageId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messageId'],
        message: 'A message is required.',
      });
    }
  });

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  // Prove the teacher owns the conversation once; every write below is then
  // anchored to it, so a message id from another lesson cannot be reached.
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

  if (data.intent === 'rename') {
    const packetTitle = data.packetTitle?.trim() || null;
    await prisma.lessonPlanConversation.update({
      where: { id: conversation.id },
      data: { packetTitle },
    });
    return dataResponse({ packetTitle });
  }

  if (data.intent === 'rename-section') {
    const sectionTitle = data.sectionTitle?.trim() || null;
    const { count } = await prisma.lessonPlanMessage.updateMany({
      where: {
        id: data.messageId,
        conversationId: conversation.id,
        role: 'assistant',
      },
      data: { keptTitle: sectionTitle },
    });
    if (count === 0) {
      return dataResponse(
        { error: 'That section is not part of this lesson.' },
        { status: 404 }
      );
    }
    return dataResponse({ messageId: data.messageId, sectionTitle });
  }

  const keeping = data.intent === 'keep';
  const { count } = await prisma.lessonPlanMessage.updateMany({
    where: {
      id: data.messageId,
      conversationId: conversation.id,
      // Only the planner's own replies are lesson material.
      role: 'assistant',
    },
    data: keeping
      ? { keptAt: new Date(), keptAudience: data.audience ?? 'teacher' }
      : { keptAt: null, keptAudience: null },
  });

  if (count === 0) {
    return dataResponse(
      { error: 'That section is not part of this lesson.' },
      { status: 404 }
    );
  }

  return dataResponse({
    kept: keeping,
    messageId: data.messageId,
    audience: keeping ? (data.audience ?? 'teacher') : null,
  });
}
