/**
 * The lesson behind a share link (stack page redesign: Post to your class,
 * Send this lesson), read without a login. Only what the link was made to
 * open comes out: the rewritten page, the handouts as students read them,
 * the slides, the writing prompt. Never the teacher's notes to themselves
 * (a sub's plan is the rewrite, made for them).
 */
import { prisma } from '~/utils/db.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { buildLessonPacket } from './lesson-packet';
import { findShareLink } from './lesson-share.server';
import { parseShareItems, type ShareAudience } from './lesson-share';
import { readSlideDeck, type SlideDeck } from './slide-deck';
import { handoutContent, studentVersionKey, answerLinesFor } from './step-handout';
import { stackSteps } from './stack-steps';
import { orderStackEntries } from './stack-order';
import { stackTiming } from './stack-timing';

export type SharedLesson = {
  audience: ShareAudience;
  title: string;
  className: string | null;
  note: string | null;
  body: string | null;
  handouts: Array<{ id: string; title: string; content: string; lines: number }>;
  prompts: Array<{ id: string; title: string; content: string }>;
  deck: SlideDeck | null;
  /** Speaker notes go to a sub, who has to run the slides; never to students. */
  withNotes: boolean;
  writing: { percent: number; minutes: number } | null;
  /** How the slides are drawn: the same template the teacher presents with. */
  deckTemplate: 'gallery' | 'tile' | 'plain';
};

export async function loadSharedLesson(token: string): Promise<SharedLesson | null> {
  const link = await findShareLink(token);
  if (!link) return null;
  const includes = new Set(parseShareItems((link.includes as string[]).join(',')));
  const conversation = await prisma.lessonPlanConversation.findUnique({
    where: { id: link.conversation.id },
    select: {
      organizationId: true,
      title: true,
      packetTitle: true,
      periodMinutes: true,
      lessonClassLabel: true,
      materials: {
        select: {
          id: true,
          kind: true,
          title: true,
          audience: true,
          content: true,
          sourceCreatedAt: true,
          position: true,
          minutes: true,
          stepType: true,
          label: true,
          hasHandout: true,
          yawpAssignmentId: true,
          yawpCreatedAt: true,
          studentVersion: true,
          studentVersionKey: true,
        },
      },
    },
  });
  if (!conversation) return null;

  const ordered = orderStackEntries(
    conversation.materials.map((material) => ({
      at: material.sourceCreatedAt.getTime(),
      order: 1,
      position: material.position,
      item: material,
    }))
  );
  const packet = buildLessonPacket({
    title: conversation.packetTitle ?? conversation.title,
    className: conversation.lessonClassLabel,
    sections: ordered.map((material) => ({
      id: material.id,
      content: material.content,
      keptAudience: material.audience,
      keptTitle: material.title,
      origin: 'material' as const,
      kind: material.kind === 'slides' ? ('slides' as const) : ('plan' as const),
      minutes: material.minutes,
    })),
  });
  const byId = new Map(conversation.materials.map((material) => [material.id, material]));
  const steps = stackSteps({
    packet,
    materialKinds: Object.fromEntries(conversation.materials.map((m) => [m.id, m.kind])),
    materialMeta: Object.fromEntries(
      conversation.materials.map((m) => [
        m.id,
        {
          stepType: m.stepType,
          label: m.label,
          minutes: m.minutes,
          hasHandout: m.hasHandout,
          yawpAssignmentId: m.yawpAssignmentId,
          yawpCreated: Boolean(m.yawpCreatedAt),
        },
      ])
    ),
    materialTokens: {},
    stackDetails: {},
  });

  const handouts = includes.has('handouts')
    ? steps.flatMap((step) => {
        if (!step.hasHandout) return [];
        const row = byId.get(step.id)!;
        const fresh =
          row.studentVersion && row.studentVersionKey === studentVersionKey(row.content)
            ? row.studentVersion
            : null;
        const content = handoutContent(step, fresh);
        return content ? [{ id: step.id, title: step.title, content, lines: answerLinesFor(step) }] : [];
      })
    : [];
  const prompts = includes.has('daily-pages')
    ? steps
        .filter((step) => step.kind === 'daily-pages' || step.kind === 'class-starter')
        .map((step) => ({ id: step.id, title: step.title, content: step.content }))
    : [];
  const deckRow = includes.has('deck')
    ? conversation.materials.find((material) => material.kind === 'slides')
    : undefined;
  const deckOutcome = deckRow ? readSlideDeck(deckRow.content) : null;
  const timing = stackTiming(steps, conversation.periodMinutes);
  const { deckV2, deckGallery } = deckOutcome?.kind === 'deck'
    ? await getLessonPlannerReviewFlags(conversation.organizationId)
    : { deckV2: false, deckGallery: false };
  const audience = link.audience as ShareAudience;

  return {
    audience,
    title: packet.title,
    className: conversation.lessonClassLabel,
    note: link.note,
    body:
      includes.has('plan') || includes.has('summary') || includes.has('help') ? link.body : null,
    handouts,
    prompts,
    deck: deckOutcome?.kind === 'deck' ? deckOutcome.deck : null,
    withNotes: audience === 'sub',
    writing: includes.has('writing')
      ? { percent: timing.writingPercent, minutes: timing.writingMinutes }
      : null,
    deckTemplate: deckGallery ? 'gallery' : deckV2 ? 'tile' : 'plain',
  };
}
