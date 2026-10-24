/**
 * The lesson's deck: the one filed in the stack, or else the newest one the
 * planner built for the lesson, in the chat or on the stack (Oct 24 handoff:
 * the packet, the slides PDF and Open slideshow all find it the same way).
 */
import { prisma } from '~/utils/db.server';
import { readSlideDeck, SLIDE_DECK_FENCE, type SlideDeck } from './slide-deck';

export type LessonDeck = { id: string; deck: SlideDeck; filed: boolean };

export async function lessonDeck(conversationId: string): Promise<LessonDeck | null> {
  const filed = await prisma.lessonPlanMaterial.findFirst({
    where: { conversationId, kind: 'slides' },
    select: { id: true, content: true },
  });
  if (filed) {
    const outcome = readSlideDeck(filed.content);
    if (outcome.kind === 'deck') return { id: filed.id, deck: outcome.deck, filed: true };
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
    if (outcome.kind === 'deck') return { id: reply.id, deck: outcome.deck };
  }
  return null;
}
