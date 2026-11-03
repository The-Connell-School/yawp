/**
 * Saving a hand-edited deck (Brian's review, E2).
 *
 * The edit replaces the planner's deck rather than sitting beside it: it is
 * filed in the lesson's one `deck` slot, marked as edited, so the chat card,
 * Present and PowerPoint all show the teacher's version, and a later planner
 * revision has to ask before it replaces their work (the packet API's
 * existing confirmReplace guard).
 */
import { nextPositionFor } from './stack-order.server';
import { prisma } from '~/utils/db.server';
import { DECK_KIND, DECK_SLOT } from './lesson-material';
import { fenceSlideDeck, type SlideDeck } from './slide-deck';

export async function saveEditedDeck({
  conversationId,
  deckId,
  deck,
}: {
  /** Already checked to belong to the teacher. */
  conversationId: string;
  /** The reply the deck came from, or the filed deck being edited again. */
  deckId: string;
  deck: SlideDeck;
}): Promise<{ materialId: string; sourceMessageId: string } | null> {
  const message = await prisma.lessonPlanMessage.findFirst({
    where: { id: deckId, conversationId, role: 'assistant' },
    select: { id: true, createdAt: true },
  });
  const filed = message
    ? null
    : await prisma.lessonPlanMaterial.findFirst({
        where: { id: deckId, conversationId },
        select: { id: true, sourceMessageId: true, sourceCreatedAt: true },
      });
  const source = message
    ? { id: message.id, createdAt: message.createdAt }
    : filed
      ? { id: filed.sourceMessageId, createdAt: filed.sourceCreatedAt }
      : null;
  if (!source) return null;

  const now = new Date();
  const fields = {
    kind: DECK_KIND,
    title: deck.title,
    audience: 'teacher',
    content: fenceSlideDeck(deck),
    sourceMessageId: source.id,
    sourceCreatedAt: source.createdAt,
    blockKey: DECK_SLOT,
    editedAt: now,
  };
  const saved = await prisma.lessonPlanMaterial.upsert({
    where: { conversationId_slot: { conversationId, slot: DECK_SLOT } },
    create: {
      conversationId,
      slot: DECK_SLOT,
      ...fields,
      position: await nextPositionFor(conversationId),
    },
    update: fields,
    select: { id: true },
  });
  return { materialId: saved.id, sourceMessageId: source.id };
}
