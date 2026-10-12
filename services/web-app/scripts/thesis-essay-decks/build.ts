/**
 * Writes the hybrid Thesis-Driven Essay decks.
 *
 *   bun scripts/thesis-essay-decks/build.ts [outDir] [deck ...]
 *
 * Defaults to docs/decks/thesis-driven-essay at the repo root and all decks.
 * Name decks to build only those, e.g. `build.ts "" lesson-3-thesis-statement`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DECKS } from './decks';
import { renderHybridDeck } from './render-hybrid-deck';

const [outArg, ...only] = process.argv.slice(2);
const outDir = resolve(outArg || join(import.meta.dir, '../../../../docs/decks/thesis-driven-essay'));
mkdirSync(outDir, { recursive: true });

for (const { file, deck } of DECKS) {
  if (only.length && !only.includes(file)) continue;
  const path = join(outDir, `${file}.pptx`);
  writeFileSync(path, await renderHybridDeck(deck));
  console.log(`wrote ${path} (${deck.slides.length} slides)`);
}
