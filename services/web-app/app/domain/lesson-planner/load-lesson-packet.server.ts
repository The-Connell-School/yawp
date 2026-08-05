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
import { packetKindForMaterial } from './lesson-material';

export type LoadedLessonPacket = {
  conversationId: string;
  packet: LessonPacket;
  /**
   * The name the teacher typed, kept apart from the packet's title so a blank
   * field falls back rather than saving the conversation title as a real name.
   */
  packetTitleValue: string;
  /** Whether the teacher has starred this lesson as worth teaching again. */
  starred: boolean;
};

export async function loadLessonPacket({
  request,
  conversationId,
}: {
  request: Request;
  conversationId: string | undefined;
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
      starredAt: true,
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
    : null;

  // Kept replies and individually saved materials are one document, ordered by
  // the reply each came from so the packet reads in lesson order rather than in
  // the order the teacher happened to click.
  const sections = [
    ...conversation.messages.map((message) => ({
      at: message.createdAt.getTime(),
      order: 0,
      section: {
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
      section: {
        id: material.id,
        content: material.content,
        keptAudience: material.audience,
        keptTitle: material.title,
        kind: packetKindForMaterial(material.kind),
        origin: 'material' as const,
      },
    })),
  ]
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map((entry) => entry.section);

  return {
    conversationId: conversation.id,
    packet: buildLessonPacket({
      title: conversation.packetTitle ?? conversation.title,
      className,
      sections,
    }),
    packetTitleValue: conversation.packetTitle ?? '',
    starred: Boolean(conversation.starredAt),
  };
}
