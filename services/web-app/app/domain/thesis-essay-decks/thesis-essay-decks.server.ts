import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeckScene } from './deck-scene';
import {
  THESIS_ESSAY_DECKS,
  THESIS_ESSAY_MATERIALS,
  deckMaterial,
  isDeckAssetName,
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

/** The slugs of the decks the presenter can draw (their `<deck>.scene.json` is there). */
export function listPresentableThesisEssayDeckSlugs(): Set<string> {
  const dir = deckDirectory();
  if (!dir) return new Set();
  return new Set(
    THESIS_ESSAY_DECKS.filter((deck) => existsSync(path.join(dir, `${deck.slug}.scene.json`))).map(
      (deck) => deck.slug
    )
  );
}

/** A deck as the presenter draws it (`<deck>.scene.json`), or null when it is not there. */
export async function readThesisEssayDeckScene(deck: ThesisEssayDeck): Promise<DeckScene | null> {
  const dir = deckDirectory();
  const file = dir ? path.join(dir, `${deck.slug}.scene.json`) : null;
  if (!file || !existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8')) as DeckScene;
}

/** An image or icon from the decks' asset folder, or null for any other name. */
export async function readThesisEssayDeckAsset(name: string): Promise<Buffer | null> {
  if (!isDeckAssetName(name)) return null;
  const dir = deckDirectory();
  const file = dir ? path.join(dir, 'assets', name) : null;
  if (!file || !existsSync(file)) return null;
  return readFile(file);
}
