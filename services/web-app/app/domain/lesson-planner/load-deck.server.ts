/**
 * Finding one deck a teacher owns, for everything that hands it over.
 *
 * Projecting a deck and downloading it ask the same question — is this deck
 * this teacher's, and does it parse — and they have to answer it identically.
 * Two copies of the lookup drift, and the drift shows up as a file a teacher
 * can present but not export, or worse, the other way round.
 *
 * The id is a reply for a deck still in the transcript, or a filed artifact for
 * one already in the packet. Both are decks the teacher can use, so both are
 * decks they can take with them — a deck should not have to be filed before it
 * can leave.
 */
import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { parseSlideDeck, type SlideDeck } from './slide-deck';

export type LoadedLessonDeck = {
  conversationId: string;
  /** The lesson's name, for whoever needs to title a file or a screen. */
  lessonTitle: string;
  deck: SlideDeck;
};

export async function loadLessonDeck({
  request,
  conversationId,
  deckId,
}: {
  request: Request;
  conversationId: string | undefined;
  deckId: string | undefined;
}): Promise<LoadedLessonDeck> {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');

  const owned = {
    id: conversationId,
    membershipId: access.membership.id,
    deletedAt: null,
  };
  const conversationSelect = {
    select: { id: true, title: true, packetTitle: true },
  };

  const source =
    (await prisma.lessonPlanMessage.findFirst({
      where: { id: deckId, role: 'assistant', conversation: owned },
      select: { content: true, conversation: conversationSelect },
    })) ??
    (await prisma.lessonPlanMaterial.findFirst({
      where: { id: deckId, conversation: owned },
      select: { content: true, conversation: conversationSelect },
    }));
  if (!source) throw new Response('Not Found', { status: 404 });

  const parsed = parseSlideDeck(source.content);
  // A reply with no deck in it, or one the schema turned down. There is nothing
  // to project and nothing to export.
  if (!parsed) throw new Response('Not Found', { status: 404 });

  return {
    conversationId: source.conversation.id,
    lessonTitle:
      source.conversation.packetTitle?.trim() || source.conversation.title,
    deck: parsed.deck,
  };
}
