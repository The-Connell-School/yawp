/**
 * Loading a teacher's lesson packet, once, for everything that renders it.
 *
 * The packet page and the PDF download have to agree exactly — same access
 * check, same ordering, same title, same sections. Two copies of this drift,
 * and the drift shows up as a downloaded file that does not match the page the
 * teacher was looking at when they clicked.
 */
import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { buildLessonPacket, type LessonPacket } from './lesson-packet';
import { MATERIAL_KIND_LABELS, packetKindForMaterial, type ArtifactKind } from './lesson-material';
import { findWritingExerciseTypeIds } from './yawp-catalog.server';
import { stackCreateLink, type StackCreateLink } from './stack-create-link';
import { getQuickWritingLessons } from '~/utils/writing-lessons/static-lessons.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { nameIsProvisional } from './lesson-name';
import { orderStackEntries } from './stack-order';

export type LoadedLessonPacket = {
  conversationId: string;
  packet: LessonPacket;
  /**
   * The name the teacher typed, kept apart from the packet's title so a blank
   * field falls back rather than saving the conversation title as a real name.
   */
  packetTitleValue: string;
  /** Whether the teacher has published this lesson to their library. */
  published: boolean;
  /**
   * Still named after the teacher's first message (Brian's review, B5), so
   * the page asks for a name rather than presenting that message as one.
   */
  nameIsProvisional: boolean;
  /** Brian's review flags for this school. */
  reviewFlags: { intakeV2: boolean; stackV2: boolean; deckV2: boolean };
  /**
   * Per filed piece, by section id (Brian's run 2, A5): what it is called
   * ("Class Starter", not "Handout") and, for a writing piece, the link that
   * makes it a real assignment. Only under stack v2.
   */
  stackDetails: Record<string, { label: string; create: StackCreateLink | null }>;
  /** The lesson's length, once the teacher said (Brian's run 2, B1). */
  periodMinutes: number | null;
};

const WRITING_KINDS = new Set(['class-starter', 'daily-pages', 'exit-ticket']);

export async function loadLessonPacket({
  request,
  conversationId,
  withStackDetails = true,
}: {
  request: Request;
  conversationId: string | undefined;
  /** The page's per-piece labels and create links; a download needs neither. */
  withStackDetails?: boolean;
}): Promise<LoadedLessonPacket> {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');

  const conversation = await prisma.lessonPlanConversation.findFirst({
    where: {
      id: conversationId,
      membershipId: access.membership.id,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      packetTitle: true,
      publishedAt: true,
      unitDay: true,
      periodMinutes: true,
      lessonClassLabel: true,
      originClassAssignment: {
        select: {
          class: { select: { title: true, grade: true, period: true } },
          assignment: { select: { title: true } },
        },
      },
      messages: {
        where: { keptAt: { not: null }, role: 'assistant' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          createdAt: true,
          content: true,
          keptAudience: true,
          keptTitle: true,
          position: true,
        },
      },
      materials: {
        orderBy: [{ sourceCreatedAt: 'asc' }, { blockKey: 'asc' }],
        select: {
          id: true,
          sourceCreatedAt: true,
          blockKey: true,
          kind: true,
          title: true,
          audience: true,
          content: true,
          editedAt: true,
          position: true,
          sourceMessageId: true,
        },
      },
    },
  });
  if (!conversation) throw new Response('Not Found', { status: 404 });

  const klass = conversation.originClassAssignment?.class;
  const className = klass
    ? (klass.title ??
      (klass.grade && klass.period
        ? `${klass.grade} · Period ${klass.period}`
        : (klass.grade ?? null)))
    : // The class the teacher named when they gave the length (run 2, B1).
      (conversation.lessonClassLabel ?? null);

  // Kept replies and individually saved materials are one document, ordered by
  // the reply each came from so the packet reads in lesson order rather than in
  // the order the teacher happened to click — until the teacher puts the stack
  // in their own order (Brian's run 2, A1), which then wins.
  const sections = orderStackEntries([
    ...conversation.messages.map((message) => ({
      at: message.createdAt.getTime(),
      order: 0,
      position: message.position,
      item: {
        id: message.id,
        content: message.content,
        keptAudience: message.keptAudience,
        keptTitle: message.keptTitle,
      },
    })),
    ...conversation.materials.map((material) => ({
      at: material.sourceCreatedAt.getTime(),
      // A material sits after the reply that produced it.
      order: 1,
      position: material.position,
      item: {
        id: material.id,
        content: material.content,
        keptAudience: material.audience,
        keptTitle: material.title,
        kind: packetKindForMaterial(material.kind),
        origin: 'material' as const,
        editedAt: material.editedAt,
      },
    })),
  ]);

  const reviewFlags = await getLessonPlannerReviewFlags(
    access.membership.organization.id
  );
  const stackDetails: LoadedLessonPacket['stackDetails'] = {};
  if (reviewFlags.stackV2 && withStackDetails) {
    const writing = conversation.materials.filter((material) =>
      WRITING_KINDS.has(material.kind)
    );
    const typeIds = writing.length
      ? await findWritingExerciseTypeIds({
          membershipId: access.membership.id,
          organizationId: access.membership.organization.id,
        })
      : null;
    const ticketSources = writing.some((material) => material.kind === 'exit-ticket')
      ? await prisma.lessonPlanMessage.findMany({
          where: {
            conversationId: conversation.id,
            id: {
              in: writing
                .filter((material) => material.kind === 'exit-ticket')
                .map((material) => material.sourceMessageId),
            },
          },
          select: { id: true, content: true },
        })
      : [];
    const sourceById = new Map(ticketSources.map((message) => [message.id, message.content]));
    for (const material of conversation.materials) {
      stackDetails[material.id] = {
        label:
          MATERIAL_KIND_LABELS[material.kind as ArtifactKind] ?? material.kind,
        create: typeIds
          ? stackCreateLink({
              kind: material.kind,
              content: material.content,
              blockKey: material.blockKey,
              sourceContent: sourceById.get(material.sourceMessageId) ?? null,
              typeIds,
              conversationId: conversation.id,
            })
          : null,
      };
    }
  }

  const firstUserMessage = await prisma.lessonPlanMessage.findFirst({
    where: { conversationId: conversation.id, role: 'user' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { content: true },
  });

  return {
    conversationId: conversation.id,
    packet: buildLessonPacket({
      title: conversation.packetTitle ?? conversation.title,
      className,
      sections,
      practiceLessonTitles: Object.fromEntries(
        getQuickWritingLessons().map((lesson) => [lesson.slug, lesson.title])
      ),
    }),
    packetTitleValue: conversation.packetTitle ?? '',
    published: Boolean(conversation.publishedAt),
    nameIsProvisional: nameIsProvisional({
      title: conversation.title,
      packetTitle: conversation.packetTitle,
      firstUserMessage: firstUserMessage?.content ?? null,
      unitDay: conversation.unitDay,
    }),
    reviewFlags,
    stackDetails,
    periodMinutes: conversation.periodMinutes,
  };
}
