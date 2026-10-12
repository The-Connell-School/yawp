import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { THESIS_ESSAY_DECKS, type ThesisEssayDeck } from './thesis-essay-decks';

/**
 * Where the deck files are. The server runs from services/web-app (start.sh
 * cds there; so does `bun run dev`), and the Docker image copies
 * resources/ next to build/. The second candidate covers a process started
 * from the repo root.
 */
function deckDirectory(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'resources/thesis-essay-decks'),
    path.resolve(process.cwd(), 'services/web-app/resources/thesis-essay-decks'),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

function deckPath(deck: ThesisEssayDeck): string | null {
  const dir = deckDirectory();
  return dir ? path.join(dir, `${deck.slug}.pptx`) : null;
}

/** The decks that have a file on disk, in lesson order. */
export function listAvailableThesisEssayDecks(): ThesisEssayDeck[] {
  return THESIS_ESSAY_DECKS.filter((deck) => {
    const file = deckPath(deck);
    return file != null && existsSync(file);
  });
}

/** A deck's bytes, or null when its file is not there. */
export async function readThesisEssayDeck(deck: ThesisEssayDeck): Promise<Buffer | null> {
  const file = deckPath(deck);
  if (!file || !existsSync(file)) return null;
  return readFile(file);
}
