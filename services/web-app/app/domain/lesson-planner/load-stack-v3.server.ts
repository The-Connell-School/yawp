/**
 * Everything the run-of-show stack page shows (stack page redesign): the
 * steps in order with their time, the fixes when it runs long, the writing
 * meter, the finish line, the outputs, and what the planner suggested that
 * is not in the stack yet. Built on the same packet loader as every other
 * view of the stack, so none of them can disagree.
 */
import { prisma } from '~/utils/db.server';
import { loadLessonPacket, type LoadedLessonPacket } from './load-lesson-packet.server';
import { readSlideDeck } from './slide-deck';
import { claimCarryOvers, classKeyFor } from './stack-actions.server';
import { stackSteps, type StackStep } from './stack-steps';
import { suggestedPieces, type SuggestedPiece } from './stack-suggestions';
import { stackTiming, timeFixes, type StackTiming, type TimeFix } from './stack-timing';
import { STACK_SURFACE } from './stack-command.server';

export type StackV3 = {
  steps: StackStep[];
  timing: StackTiming;
  fixes: TimeFix[];
  suggestions: SuggestedPiece[];
  createdAt: string;
  setAt: string | null;
  lessonDate: string | null;
  className: string | null;
  deck: { id: string; slides: number; title: string } | null;
  /** The stack chat's earlier answers, newest last, for the panel. */
  askHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  /** Shown once, until the teacher closes it (Brian's run 3, item 13). */
  firstOpen: boolean;
};

export async function loadStackV3({
  request,
  conversationId,
}: {
  request: Request;
  conversationId: string | undefined;
}): Promise<(LoadedLessonPacket & { v3: StackV3 }) | null> {
  let loaded = await loadLessonPacket({ request, conversationId });
  if (!loaded.reviewFlags.stackV3) return null;

  const conversation = await prisma.lessonPlanConversation.findUniqueOrThrow({
    where: { id: loaded.conversationId },
    select: {
      id: true,
      createdAt: true,
      setAt: true,
      lessonDate: true,
      membershipId: true,
      lessonClassLabel: true,
      originClassAssignment: { select: { classId: true } },
      messages: {
        where: { role: { in: ['assistant', 'user'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, role: true, content: true, surface: true },
      },
      materials: { where: { kind: 'slides' }, select: { id: true, content: true } },
    },
  });

  // The steps moved to tomorrow for this class come in at the top.
  const claimed = await claimCarryOvers({
    id: conversation.id,
    createdAt: conversation.createdAt,
    membershipId: conversation.membershipId,
    classKey: classKeyFor({
      classId: conversation.originClassAssignment?.classId,
      lessonClassLabel: conversation.lessonClassLabel,
    }),
  });
  if (claimed) loaded = await loadLessonPacket({ request, conversationId });

  const steps = stackSteps(loaded);
  const timing = stackTiming(steps, loaded.periodMinutes);
  const assistant = conversation.messages.filter((message) => message.role === 'assistant');
  const deckRow = conversation.materials[0];
  const deckOutcome = deckRow ? readSlideDeck(deckRow.content) : null;

  return {
    ...loaded,
    v3: {
      steps,
      timing,
      fixes: timeFixes(timing),
      suggestions: suggestedPieces({
        messages: assistant,
        inStack: new Set(Object.values(loaded.materialTokens)),
        stackSlots: new Set(Object.values(loaded.materialMeta).map((meta) => meta.slot)),
      }),
      createdAt: conversation.createdAt.toISOString(),
      setAt: conversation.setAt?.toISOString() ?? null,
      lessonDate: conversation.lessonDate?.toISOString() ?? null,
      className: loaded.packet.className,
      deck:
        deckRow && deckOutcome?.kind === 'deck'
          ? { id: deckRow.id, slides: deckOutcome.deck.slides.length, title: deckOutcome.deck.title }
          : null,
      askHistory: conversation.messages
        .filter((message) => message.surface === STACK_SURFACE)
        .slice(-12)
        .map((message) => ({
          id: message.id,
          role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: message.content,
        })),
      firstOpen: !conversation.setAt && !conversation.messages.some((message) => message.surface === STACK_SURFACE),
    },
  };
}
