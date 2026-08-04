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
import { readLessonMaterials } from '~/domain/lesson-planner/lesson-material';

const MAX_PACKET_TITLE_CHARS = 120;
const MAX_SECTION_TITLE_CHARS = 120;

const MESSAGE_INTENTS = [
  'keep',
  'drop',
  'rename-section',
  'add-material',
  'remove-material',
] as const;

const POST = z
  .object({
    intent: z.enum([
      'keep',
      'drop',
      'rename',
      'rename-section',
      'add-material',
      'remove-material',
      'rename-material',
    ]),
    conversationId: z.string().min(1),
    messageId: z.string().min(1).optional(),
    /** A saved material's own id, for renaming it in the packet. */
    materialId: z.string().min(1).optional(),
    /** Which material block within the reply, for the material intents. */
    materialKey: z.string().min(1).max(8).optional(),
    audience: z.enum(PACKET_AUDIENCES).optional(),
    packetTitle: z.string().max(MAX_PACKET_TITLE_CHARS).optional(),
    sectionTitle: z.string().max(MAX_SECTION_TITLE_CHARS).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.intent === 'add-material' || value.intent === 'remove-material') &&
      !value.materialKey
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['materialKey'],
        message: 'A material is required.',
      });
    }
    if (
      (MESSAGE_INTENTS as readonly string[]).includes(value.intent) &&
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

  if (data.intent === 'rename-material') {
    if (!data.materialId) {
      return dataResponse(
        { error: 'A material is required.' },
        { status: 422 }
      );
    }
    const { count } = await prisma.lessonPlanMaterial.updateMany({
      where: { id: data.materialId, conversationId: conversation.id },
      // A material always has a name, so a blank field means "use the original
      // one back", which the client sends explicitly.
      data: { title: data.sectionTitle?.trim() || 'Untitled material' },
    });
    if (count === 0) {
      return dataResponse(
        { error: 'That material is not part of this lesson.' },
        { status: 404 }
      );
    }
    return dataResponse({
      materialId: data.materialId,
      sectionTitle: data.sectionTitle,
    });
  }

  // A material is kept on its own: a teacher who wants the handout should not
  // have to take the whole lesson plan wrapped around it.
  if (data.intent === 'add-material' || data.intent === 'remove-material') {
    if (data.intent === 'remove-material') {
      await prisma.lessonPlanMaterial.deleteMany({
        where: {
          conversationId: conversation.id,
          sourceMessageId: data.messageId!,
          blockKey: data.materialKey!,
        },
      });
      return dataResponse({
        added: false,
        messageId: data.messageId,
        materialKey: data.materialKey,
      });
    }

    const message = await prisma.lessonPlanMessage.findFirst({
      where: {
        id: data.messageId,
        conversationId: conversation.id,
        role: 'assistant',
      },
      select: { id: true, createdAt: true, content: true },
    });
    if (!message) {
      return dataResponse(
        { error: 'That material is not part of this lesson.' },
        { status: 404 }
      );
    }

    // Re-read the material from the reply rather than trusting the client with
    // its content: the body is what gets printed and handed to students.
    const { materials } = readLessonMaterials(message.content);
    const material = materials.find((item) => item.key === data.materialKey);
    if (!material) {
      return dataResponse(
        { error: 'That material is not part of this lesson.' },
        { status: 404 }
      );
    }

    const saved = {
      kind: material.kind,
      title: material.title,
      audience: data.audience ?? material.audience,
      content: material.content,
      sourceCreatedAt: message.createdAt,
    };
    await prisma.lessonPlanMaterial.upsert({
      where: {
        conversationId_sourceMessageId_blockKey: {
          conversationId: conversation.id,
          sourceMessageId: message.id,
          blockKey: material.key,
        },
      },
      create: {
        conversationId: conversation.id,
        sourceMessageId: message.id,
        blockKey: material.key,
        ...saved,
      },
      update: saved,
    });

    return dataResponse({
      added: true,
      messageId: message.id,
      materialKey: material.key,
      title: material.title,
    });
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
