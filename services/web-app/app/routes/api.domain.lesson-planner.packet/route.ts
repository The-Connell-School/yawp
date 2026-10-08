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
import { artifactFromAssistantReply } from '~/domain/lesson-planner/artifact-from-reply';

const MAX_PACKET_TITLE_CHARS = 120;
const MAX_SECTION_TITLE_CHARS = 120;
// A handout runs several printed pages; a tight cap would clip one mid-page.
const MAX_MATERIAL_CONTENT_CHARS = 20_000;

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
      'edit-material',
      'publish',
      'unpublish',
      'delete',
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
    /** New body for `edit-material`. */
    content: z.string().max(MAX_MATERIAL_CONTENT_CHARS).optional(),
    /**
     * Set to file a revision over a material the teacher has hand-edited
     * anyway — the confirmation a conflict asks for, sent back explicitly
     * rather than assumed.
     */
    confirmReplace: z.enum(['1']).optional(),
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
    if (value.intent === 'edit-material' && !value.materialId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['materialId'],
        message: 'A material is required.',
      });
    }
    if (value.intent === 'edit-material' && value.content === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Content is required.',
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

  // Publishing is the teacher saying this one is finished and worth finding
  // again — the decision that moves a lesson out of their drafts and into their
  // library. Reversible, unlike the old library a lesson entered as a side
  // effect of keeping a reply and could never leave.
  if (data.intent === 'publish' || data.intent === 'unpublish') {
    const publishedAt = data.intent === 'publish' ? new Date() : null;
    await prisma.lessonPlanConversation.update({
      where: { id: conversation.id },
      data: { publishedAt },
    });
    return dataResponse({ publishedAt: publishedAt?.toISOString() ?? null });
  }

  // Soft delete: every read already filters on deletedAt, and a teacher who
  // clears out a stale draft should not lose the messages underneath it.
  if (data.intent === 'delete') {
    await prisma.lessonPlanConversation.update({
      where: { id: conversation.id },
      data: { deletedAt: new Date() },
    });
    return dataResponse({ deleted: true });
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

  // A teacher's own words in a handout, saved directly. `editedAt` is what
  // forks this material out of the model's control: a revision the planner
  // writes for the same slot after this can no longer replace it without
  // asking, because the content here is no longer something the model wrote.
  if (data.intent === 'edit-material') {
    const { count } = await prisma.lessonPlanMaterial.updateMany({
      where: { id: data.materialId!, conversationId: conversation.id },
      data: { content: data.content!, editedAt: new Date() },
    });
    if (count === 0) {
      return dataResponse(
        { error: 'That material is not part of this lesson.' },
        { status: 404 }
      );
    }
    return dataResponse({
      materialId: data.materialId,
      content: data.content,
      edited: true,
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
    const material = artifactFromAssistantReply(
      message.content,
      data.materialKey!
    );
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
      sourceMessageId: message.id,
      blockKey: material.key,
    };
    // Keyed by what the artifact IS, so filing a revision takes the original's
    // place. A teacher who asks for a shorter handout wants one handout.
    const replaced = await prisma.lessonPlanMaterial.findUnique({
      where: {
        conversationId_slot: {
          conversationId: conversation.id,
          slot: material.slot,
        },
      },
      select: { sourceMessageId: true, blockKey: true, editedAt: true },
    });

    // A different version filed over a hand-edited one is exactly the case
    // `editedAt` exists to catch: without asking, the teacher's own words
    // vanish under whatever the model happened to write next. Re-filing the
    // same material the edit was made on is not a conflict — that already
    // has nowhere else to go — so only a genuinely different source blocks.
    const isDifferentVersion =
      replaced &&
      (replaced.sourceMessageId !== message.id ||
        replaced.blockKey !== material.key);
    if (replaced?.editedAt && isDifferentVersion && !data.confirmReplace) {
      return dataResponse(
        {
          error: 'edited',
          conflict: true,
          message:
            'This has been edited by hand. Filing the new version will replace those edits.',
        },
        { status: 409 }
      );
    }

    await prisma.lessonPlanMaterial.upsert({
      where: {
        conversationId_slot: {
          conversationId: conversation.id,
          slot: material.slot,
        },
      },
      create: {
        conversationId: conversation.id,
        slot: material.slot,
        ...saved,
      },
      // Confirmed or not previously edited: the content now on file came from
      // the model again, so any earlier fork is over.
      update: { ...saved, editedAt: null },
    });

    return dataResponse({
      added: true,
      messageId: message.id,
      materialKey: material.key,
      title: material.title,
      // So the card for the version this replaced stops claiming to be filed.
      replaced:
        replaced && replaced.sourceMessageId !== message.id
          ? `${replaced.sourceMessageId}:${replaced.blockKey}`
          : null,
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
