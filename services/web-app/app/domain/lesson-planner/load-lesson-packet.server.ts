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
import { createdFor, linksByToken } from './assignment-links';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { buildLessonPacket, type LessonPacket } from './lesson-packet';
import { DECK_KIND, MATERIAL_KIND_LABELS, packetKindForMaterial, type ArtifactKind } from './lesson-material';
import { findWritingExerciseTypeIds } from './yawp-catalog.server';
import { stackCreateLink, type StackCreateLink } from './stack-create-link';
import { getQuickWritingLessons } from '~/utils/writing-lessons/static-lessons.server';
import {
  getLessonPlannerReviewFlags,
  type LessonPlannerReviewFlags,
} from '~/domain/feature-flags/feature-flags.server';
import { nameIsProvisional } from './lesson-name';
import { withoutTrailingCommentary } from './plan-steps';
import { DEFAULT_STEP_MINUTES, stepTypeFor } from './step-types';
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
  reviewFlags: LessonPlannerReviewFlags;
  /**
   * Per filed piece, by section id (Brian's run 2, A5): what it is called
   * ("Class Starter", not "Handout") and, for a writing piece, the link that
   * makes it a real assignment. Only under stack v2.
   */
  stackDetails: Record<string, { label: string; create: StackCreateLink | null }>;
  /** The lesson's length, once the teacher said (Brian's run 2, B1). */
  periodMinutes: number | null;
  /** Each filed piece's own kind, by id ("class-starter", "step", …). */
  materialKinds: Record<string, string>;
  /** Each filed piece's chat card, by id: "<messageId>:<blockKey>". */
  materialTokens: Record<string, string>;
  /** Each filed piece's run 3 step fields, by id (null columns stay null). */
  materialMeta: Record<
    string,
    {
      stepType: string | null;
      label: string | null;
      minutes: number | null;
      hasHandout: boolean | null;
      yawpAssignmentId: string | null;
      yawpCreated: boolean;
      slot: string;
    }
  >;
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
      // One record per assignment, the chat's and the stack's (Oct 24 handoff, task 1).
      assignmentLinks: {
        select: { sourceMessageId: true, blockKey: true, yawpHref: true, createdFrom: true },
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
          minutes: true,
          stepType: true,
          yawpHref: true,
          yawpCreatedAt: true,
          label: true,
          hasHandout: true,
          yawpAssignmentId: true,
          slot: true,
        },
      },
    },
  });
  if (!conversation) throw new Response('Not Found', { status: 404 });
  const assignmentLinks = linksByToken(conversation.assignmentLinks);

  const klass = conversation.originClassAssignment?.class;
  const className = klass
    ? (klass.title ??
      (klass.grade && klass.period
        ? `${klass.grade} · Period ${klass.period}`
        : (klass.grade ?? null)))
    : // The class the teacher named when they gave the length (run 2, B1).
      (conversation.lessonClassLabel ?? null);

  const reviewFlags = await getLessonPlannerReviewFlags(
    access.membership.organization.id
  );

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
        // A closing step filed before run 3 may still carry the planner's
        // total and closing question (Brian's run 3, item 5). Shown without
        // them; a teacher's own edit is left as written.
        content:
          material.kind === 'step' && !material.editedAt
            ? withoutTrailingCommentary(material.content)
            : material.content,
        keptAudience: material.audience,
        keptTitle: material.title,
        kind: packetKindForMaterial(material.kind),
        origin: 'material' as const,
        editedAt: material.editedAt,
        minutes: material.minutes,
        // Every step shows a time (Brian's run 3, item 9). The deck is built
        // from the stack, not a step of it.
        suggestedMinutes:
          !reviewFlags.stackV2 || material.kind === DECK_KIND
            ? null
            : DEFAULT_STEP_MINUTES[
                stepTypeFor({ kind: material.kind, title: material.title, stored: material.stepType })
              ],
      },
    })),
  ]);

  const stackDetails: LoadedLessonPacket['stackDetails'] = {};
  if (reviewFlags.stackV2 && withStackDetails) {
    // A step can be writing too, a prose exit ticket or quick write (Brian's
    // run 3, item 4), so steps get a link when students write in them.
    const writing = conversation.materials.filter(
      (material) => WRITING_KINDS.has(material.kind) || material.kind === 'step'
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
              title: material.title,
              stepType: material.stepType,
              content: material.content,
              blockKey: material.blockKey,
              sourceContent: sourceById.get(material.sourceMessageId) ?? null,
              typeIds,
              conversationId: conversation.id,
              materialId: material.id,
              created: createdFor(assignmentLinks, material),
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
    materialKinds: Object.fromEntries(
      conversation.materials.map((material) => [material.id, material.kind])
    ),
    materialTokens: Object.fromEntries(
      conversation.materials.map((material) => [
        material.id,
        `${material.sourceMessageId}:${material.blockKey}`,
      ])
    ),
    materialMeta: Object.fromEntries(
      conversation.materials.map((material) => [
        material.id,
        {
          stepType: material.stepType,
          label: material.label,
          minutes: material.minutes,
          hasHandout: material.hasHandout,
          yawpAssignmentId: material.yawpAssignmentId,
          yawpCreated: Boolean(createdFor(assignmentLinks, material)),
          slot: material.slot,
        },
      ])
    ),
  };
}
