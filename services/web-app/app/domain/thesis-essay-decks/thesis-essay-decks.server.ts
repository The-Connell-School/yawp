import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  THESIS_ESSAY_DECKS,
  THESIS_ESSAY_MATERIALS,
  deckMaterial,
  type ThesisEssayDeck,
  type ThesisEssayMaterial,
} from './thesis-essay-decks';

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

function materialPath(material: ThesisEssayMaterial): string | null {
  const dir = deckDirectory();
  return dir ? path.join(dir, material.fileName) : null;
}

function isOnDisk(material: ThesisEssayMaterial): boolean {
  const file = materialPath(material);
  return file != null && existsSync(file);
}

/** The decks that have a file on disk, in lesson order. */
export function listAvailableThesisEssayDecks(): ThesisEssayDeck[] {
  return THESIS_ESSAY_DECKS.filter((deck) => isOnDisk(deckMaterial(deck)));
}

/** The slugs of every deck, lesson plan and handout that has a file on disk. */
export function listAvailableThesisEssayMaterialSlugs(): Set<string> {
  return new Set(THESIS_ESSAY_MATERIALS.filter(isOnDisk).map((material) => material.slug));
}

/** A deck's, lesson plan's or handout's bytes, or null when its file is not there. */
export async function readThesisEssayMaterial(material: ThesisEssayMaterial): Promise<Buffer | null> {
  const file = materialPath(material);
  if (!file || !existsSync(file)) return null;
  return readFile(file);
}
