/**
 * Writes the hybrid Thesis-Driven Essay decks.
 *
 *   bun scripts/thesis-essay-decks/build.ts [outDir]
 *
 * Defaults to docs/decks/thesis-driven-essay at the repo root.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PREWRITING_DECK } from './prewriting-deck';
import { renderHybridDeck } from './render-hybrid-deck';

const outDir = resolve(
  process.argv[2] ?? join(import.meta.dir, '../../../../docs/decks/thesis-driven-essay')
);
mkdirSync(outDir, { recursive: true });

const decks = [{ file: 'lesson-2-pre-writing.pptx', deck: PREWRITING_DECK }];
for (const { file, deck } of decks) {
  const path = join(outDir, file);
  writeFileSync(path, await renderHybridDeck(deck));
  console.log(`wrote ${path} (${deck.slides.length} slides)`);
}
