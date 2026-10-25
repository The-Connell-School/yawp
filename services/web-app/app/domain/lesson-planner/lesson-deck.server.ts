/**
 * The lesson's deck: the one filed in the stack, or else the newest one the
 * planner built for the lesson, in the chat or on the stack (Oct 24 handoff:
 * the packet, the slides PDF and Open slideshow all find it the same way).
 */
import { prisma } from '~/utils/db.server';
import { readSlideDeck, SLIDE_DECK_FENCE, type SlideDeck } from './slide-deck';
import { syncAgendaToStack, type AgendaStep } from './deck-agenda';
import { lessonRuns } from './lesson-timing.server';

/** The stack's steps and times, as its page shows them, for the agenda slide. */
export async function stackAgendaSteps(conversationId: string): Promise<AgendaStep[]> {
  const run = (await lessonRuns([conversationId], true))[conversationId];
  return run ? run.steps.map((step) => ({ title: step.title, type: step.type, minutes: step.minutes })) : [];
}

/** A deck whose agenda reads the stack's times (Brian's round 3, 1.4). */
export async function withStackTimes<T extends SlideDeck>(conversationId: string, deck: T): Promise<T> {
  if (!deck.slides.some((slide) => slide.agenda?.length)) return deck;
  return syncAgendaToStack(deck, await stackAgendaSteps(conversationId));
}

export type LessonDeck = { id: string; deck: SlideDeck; filed: boolean };

export async function lessonDeck(conversationId: string): Promise<LessonDeck | null> {
  const filed = await prisma.lessonPlanMaterial.findFirst({
    where: { conversationId, kind: 'slides' },
    select: { id: true, content: true },
  });
  if (filed) {
    const outcome = readSlideDeck(filed.content);
    if (outcome.kind === 'deck') return { id: filed.id, deck: await withStackTimes(conversationId, outcome.deck), filed: true };
  }
  const built = await newestBuiltDeck(conversationId);
  return built ? { ...built, filed: false } : null;
}

export async function newestBuiltDeck(conversationId: string): Promise<{ id: string; deck: SlideDeck } | null> {
  const replies = await prisma.lessonPlanMessage.findMany({
    where: { conversationId, role: 'assistant', content: { contains: '```' + SLIDE_DECK_FENCE } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 3,
    select: { id: true, content: true },
  });
  for (const reply of replies) {
    const outcome = readSlideDeck(reply.content);
    if (outcome.kind === 'deck') return { id: reply.id, deck: await withStackTimes(conversationId, outcome.deck) };
  }
  return null;
}
