/**
 * Everything the run-of-show stack page shows (stack page redesign): the
 * steps in order with their time, the fixes when it runs long, the writing
 * meter, the finish line, the outputs, and what the planner suggested that
 * is not in the stack yet. Built on the same packet loader as every other
 * view of the stack, so none of them can disagree.
 */
import { teacherStandards } from './teacher-standards';
import { prisma } from '~/utils/db.server';
import { loadLessonPacket, type LoadedLessonPacket } from './load-lesson-packet.server';
import { hasSlideDeck, readSlideDeck } from './slide-deck';
import { deckFreshness, deckKeyOf } from './deck-freshness';
import { readExtensionIds, splitExtensions } from './extensions';
import { claimCarryOvers, classKeyFor } from './stack-actions.server';
import { stackSteps, type StackStep } from './stack-steps';
import { suggestedPieces, type SuggestedPiece } from './stack-suggestions';
import { stackTiming, timeFixes, type StackTiming, type TimeFix } from './stack-timing';
import { STACK_SURFACE } from './stack-command.server';
import { lessonLocation, type LessonLocation } from './lesson-location';

export type StackV3 = {
  steps: StackStep[];
  timing: StackTiming;
  fixes: TimeFix[];
  suggestions: SuggestedPiece[];
  createdAt: string;
  setAt: string | null;
  lessonDate: string | null;
  className: string | null;
  deck: {
    id: string;
    slides: number;
    title: string;
    /** The reply it was filed from: its card on the stack says "In your lesson". */
    sourceMessageId: string | null;
  } | null;
  /**
   * The newest deck the planner made in the chat that is not the one in the
   * lesson (Brian's run 6, round 2): offered in the stack, so it can be added
   * as it is rather than built again.
   */
  conversationDeck: { messageId: string; content: string; onStack: boolean } | null;
  /** Set aside for a class that finishes early, out of the timing (Kevin's note 8c). */
  extensions: StackStep[];
  /** The lesson changed since the deck was made (Kevin's note 9). */
  deckStale: boolean;
  /** The stack chat's earlier answers, newest last, for the panel. */
  askHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  /** Shown once, until the teacher closes it (Brian's run 3, item 13). */
  firstOpen: boolean;
  /** The standards the teacher named in this lesson's chat, never inferred. */
  standards: string[];
  /**
   * With the library redesign on and the lesson in no unit: the units it can
   * be saved to once set (Oct 24 handoff, Part 2, L3 "Save to unit").
   */
  saveToUnit: Array<{ id: string; title: string; course: string | null }> | null;
  /**
   * Where the lesson is saved and when it last changed (Brian's round 4,
   * item 7). In the library once it is in a unit or the teacher saved it.
   */
  saved: { location: LessonLocation; at: string; inLibrary: boolean };
};

export async function loadStackV3({
  request,
  conversationId,
  loaded: already,
}: {
  request: Request;
  conversationId: string | undefined;
  /** The packet, when the caller has just loaded it. */
  loaded?: LoadedLessonPacket;
}): Promise<(LoadedLessonPacket & { v3: StackV3 }) | null> {
  let loaded = already ?? (await loadLessonPacket({ request, conversationId }));
  if (!loaded.reviewFlags.stackV3) return null;

  const conversation = await prisma.lessonPlanConversation.findUniqueOrThrow({
    where: { id: loaded.conversationId },
    select: {
      id: true,
      createdAt: true,
      setAt: true,
      lessonDate: true,
      membershipId: true,
      unitId: true,
      updatedAt: true,
      publishedAt: true,
      unit: { select: { id: true, title: true, deletedAt: true, course: { select: { name: true } } } },
      deckStackKey: true,
      extensionStepIds: true,
      lessonClassLabel: true,
      originClassAssignment: { select: { classId: true } },
      messages: {
        where: { role: { in: ['assistant', 'user'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, role: true, content: true, surface: true },
      },
      materials: { where: { kind: 'slides' }, select: { id: true, content: true, sourceMessageId: true } },
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

  const { steps, extensions } = splitExtensions(
    stackSteps(loaded),
    loaded.reviewFlags.teachNotes ? readExtensionIds(conversation.extensionStepIds) : []
  );
  const timing = stackTiming(steps, loaded.periodMinutes);
  const assistant = conversation.messages.filter((message) => message.role === 'assistant');
  const deckRow = conversation.materials[0];
  const deckOutcome = deckRow ? readSlideDeck(deckRow.content) : null;
  let deckStale = false;
  if (loaded.reviewFlags.teachNotes) {
    const fresh = deckFreshness(
      conversation.deckStackKey,
      deckRow && deckOutcome?.kind === 'deck' ? deckKeyOf(deckRow, steps) : null
    );
    deckStale = fresh.stale;
    if (fresh.store) {
      await prisma.lessonPlanConversation.update({
        where: { id: conversation.id },
        data: { deckStackKey: fresh.store },
      });
    }
  }

  // The last change: the lesson's own row, or the newest piece filed in it.
  const newest = await prisma.lessonPlanMaterial.aggregate({
    where: { conversationId: conversation.id },
    _max: { createdAt: true },
  });
  const savedAt = [conversation.updatedAt, newest._max.createdAt]
    .filter((date): date is Date => Boolean(date))
    .reduce((latest, date) => (date > latest ? date : latest));
  const unit = conversation.unit && !conversation.unit.deletedAt ? conversation.unit : null;

  return {
    ...loaded,
    v3: {
      saved: {
        location: lessonLocation(unit ? { id: unit.id, title: unit.title, courseName: unit.course?.name ?? null } : null),
        at: savedAt.toISOString(),
        inLibrary: Boolean(unit || conversation.publishedAt),
      },
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
          ? {
              id: deckRow.id,
              slides: deckOutcome.deck.slides.length,
              title: deckOutcome.deck.title,
              sourceMessageId: deckRow.sourceMessageId,
            }
          : null,
      extensions,
      deckStale,
      conversationDeck: (() => {
        // Built in the chat or on the stack: either way it is one click away.
        const newest = [...assistant].reverse().find((message) => hasSlideDeck(message.content));
        return newest && newest.id !== deckRow?.sourceMessageId
          ? { messageId: newest.id, content: newest.content, onStack: newest.surface === STACK_SURFACE }
          : null;
      })(),
      askHistory: conversation.messages
        .filter((message) => message.surface === STACK_SURFACE)
        .slice(-12)
        .map((message) => ({
          id: message.id,
          role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: message.content,
        })),
      standards: teacherStandards(
        conversation.messages.filter((message) => message.role === 'user').map((message) => message.content)
      ),
      firstOpen: !conversation.setAt && !conversation.messages.some((message) => message.surface === STACK_SURFACE),
      saveToUnit:
        loaded.reviewFlags.libraryV2 && !conversation.unitId
          ? (
              await prisma.lessonPlanUnit.findMany({
                where: { membershipId: conversation.membershipId, deletedAt: null },
                orderBy: [{ course: { position: 'asc' } }, { position: 'asc' }, { createdAt: 'asc' }],
                take: 200,
                select: { id: true, title: true, course: { select: { name: true } } },
              })
            ).map((unit) => ({ id: unit.id, title: unit.title, course: unit.course?.name ?? null }))
          : null,
    },
  };
}
