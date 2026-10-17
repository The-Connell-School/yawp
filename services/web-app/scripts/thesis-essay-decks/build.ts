/**
 * Writes the hybrid Thesis-Driven Essay decks.
 *
 *   bun scripts/thesis-essay-decks/build.ts [outDir] [deck ...]
 *
 * Each deck is written with its lesson plan (`<deck>-lesson-plan.pdf`), plus
 * the two Day 1 student handouts: sign-up and the sample essay. Defaults to
 * services/web-app/resources/thesis-essay-decks, where the app serves them
 * from (the Thesis-Driven Essay page's Modules), and all decks.
 * Name decks to build only those, e.g. `build.ts "" lesson-3-thesis-statement`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DECKS } from './decks';
import { LESSON_PLANS } from './lesson-plans';
import { renderHybridDeck } from './render-hybrid-deck';
import { renderLessonPlan, renderSampleEssayHandout, renderSignUpHandout } from './render-lesson-plan';

const [outArg, ...only] = process.argv.slice(2);
const outDir = resolve(outArg || join(import.meta.dir, '../../resources/thesis-essay-decks'));
mkdirSync(outDir, { recursive: true });

for (const { file, deck } of DECKS) {
  if (only.length && !only.includes(file)) continue;
  const path = join(outDir, `${file}.pptx`);
  writeFileSync(path, await renderHybridDeck(deck));
  console.log(`wrote ${path} (${deck.slides.length} slides)`);

  // Its lesson plan, written from the same deck so its slide numbers match.
  const plan = LESSON_PLANS.find((candidate) => candidate.deck === file);
  if (plan) {
    const planPath = join(outDir, `${file}-lesson-plan.pdf`);
    writeFileSync(planPath, await renderLessonPlan(plan, deck));
    console.log(`wrote ${planPath}`);
  }
}

if (!only.length || only.includes('student-sign-up')) {
  const handoutPath = join(outDir, 'student-sign-up.pdf');
  writeFileSync(handoutPath, await renderSignUpHandout());
  console.log(`wrote ${handoutPath}`);
}

if (!only.length || only.includes('sample-essay')) {
  const essayPath = join(outDir, 'sample-essay-bored-in-the-usa.pdf');
  writeFileSync(essayPath, await renderSampleEssayHandout());
  console.log(`wrote ${essayPath}`);
}
