/**
 * The turn that answers "rework it, or keep it as is?" (Brian, Nov 4). The
 * teacher's answer, by button or in their own words, is read before the
 * planner sees the turn; the deck it asks for is in the reply that answers
 * it, and that deck goes into the lesson's stack at once, so the teacher
 * finds it there, built the way they chose, when they open the stack.
 *
 * Keep it as is: Yawp! makes the deck from their file, slide for slide (no
 * model involved), and adds it to the reply. Rework it: the planner writes
 * the new deck in the reply. Either way the upload remembers the reply, so a
 * deck is made once.
 */
import { prisma } from '~/utils/db.server';
import { readDeckChoice } from './deck-choice';
import { deckFromUpload } from './deck-from-upload';
import { fileReplyPieces } from './file-reply-pieces.server';
import { DECK_SLOT, deckAsMaterial } from './lesson-material';
import type { DeckChoices, LessonUpload } from './lesson-uploads';
import { fenceSlideDeck, readSlideDeck } from './slide-deck';

type Source = LessonUpload & { id: string };

function allowed(mode: string | null | undefined, choices: DeckChoices): 'teach' | 'refresh' | null {
  if (mode === 'teach' && choices.teach) return 'teach';
  if (mode === 'refresh' && choices.refresh) return 'refresh';
  return null;
}

/** The teacher answered in this message: remember it, here and in the database. */
export async function applyDeckChoice({
  sources,
  message,
  choices,
  membershipId,
}: {
  sources: Source[];
  message: string;
  choices: DeckChoices;
  membershipId: string;
}): Promise<void> {
  const open = sources.filter((source) => source.keptDeck && !source.mode);
  if (!open.length) return;
  const choice = allowed(readDeckChoice(message), choices);
  if (!choice) return;
  for (const source of open) {
    const updated = await prisma.lessonPlanUpload.updateMany({
      where: { id: source.id, membershipId, keptDeck: true, mode: null },
      data: { mode: choice },
    });
    if (updated.count) source.mode = choice;
  }
}

/** "Keep it as is", not made yet: their deck as a deck block for this reply. */
export async function keptDeckBlock({
  sources,
  choices,
  membershipId,
}: {
  sources: Source[];
  choices: DeckChoices;
  membershipId: string;
}): Promise<{ uploadId: string; block: string } | null> {
  const source = sources.find((entry) => entry.keptDeck && allowed(entry.mode, choices) === 'teach' && !entry.deckBuilt);
  if (!source) return null;
  const upload = await prisma.lessonPlanUpload.findFirst({
    where: { id: source.id, membershipId, keptDeck: true },
    select: { name: true, file: true },
  });
  if (!upload?.file) return null;
  const pictures = await prisma.lessonPlanUploadPicture.findMany({
    where: { uploadId: source.id, membershipId },
    select: { id: true, position: true, width: true, height: true },
  });
  const made = deckFromUpload({ name: upload.name, file: new Uint8Array(upload.file), pictures });
  return made ? { uploadId: source.id, block: fenceSlideDeck(made.deck) } : null;
}

/** The reply with their deck as its one deck. */
export function withKeptDeck(reply: string, block: string): string {
  const outcome = readSlideDeck(reply);
  const body = outcome.kind === 'none' ? reply : outcome.body;
  return `${body.trim()}\n\n${block}`;
}

/** File the reply's deck as the lesson's deck, when it is the one an upload asked for. */
export async function fileUploadedDeck({
  conversationId,
  message,
  sources,
  choices,
  keptUploadId,
  onStack,
  file = fileReplyPieces,
}: {
  conversationId: string;
  message: { id: string; createdAt: Date; content: string };
  sources: Source[];
  choices: DeckChoices;
  /** The upload whose deck, kept as is, Yawp! added to this reply. */
  keptUploadId: string | null;
  /**
   * Asked on the stack, where a reworked deck comes back as a card to add.
   * A deck kept as is goes in from there too: it is theirs.
   */
  onStack: boolean;
  /** Files the deck; replaceable in tests. */
  file?: typeof fileReplyPieces;
}): Promise<string[]> {
  const uploadId =
    keptUploadId ??
    (onStack || !deckAsMaterial(message.content)
      ? null
      : (sources.find((source) => source.keptDeck && allowed(source.mode, choices) === 'refresh' && !source.deckBuilt)?.id ?? null));
  if (!uploadId) return [];
  // Never over a deck the teacher edited by hand: that is theirs.
  const filed = await file({ conversationId, message, onlyKeys: [DECK_SLOT] });
  if (!filed.added.length) return [];
  await prisma.lessonPlanUpload.update({ where: { id: uploadId }, data: { deckMessageId: message.id } });
  return filed.added;
}
