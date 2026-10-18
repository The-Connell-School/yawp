/**
 * Writes the hybrid Thesis-Driven Essay decks.
 *
 *   bun scripts/thesis-essay-decks/build.ts [outDir] [deck ...]
 *
 * Each deck is written as a .pptx and as the scene the on-site presenter
 * draws (`<deck>.scene.json`), with its lesson plan (`<deck>-lesson-plan.pdf`), plus
 * the lessons' handouts: sign-up, the two sample essays, the Critical Essay
 * Form, the essay prompts and quoting and citing. Defaults to
 * services/web-app/resources/thesis-essay-decks, where the app serves them
 * from (the Thesis-Driven Essay page's Modules), and all decks.
 * Name decks to build only those, e.g. `build.ts "" lesson-3-thesis-statement`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DECKS } from './decks';
import { LESSON_PLANS } from './lesson-plans';
import { renderDeckScene, renderHybridDeck } from './render-hybrid-deck';
import {
  renderAnimalFarmEssayHandout,
  renderEssayFormHandout,
  renderEssayPromptsHandout,
  renderLessonPlan,
  renderQuotingHandout,
  renderSampleEssayHandout,
  renderSignUpHandout,
} from './render-lesson-plan';

const [outArg, ...only] = process.argv.slice(2);
const outDir = resolve(outArg || join(import.meta.dir, '../../resources/thesis-essay-decks'));
mkdirSync(outDir, { recursive: true });

for (const { file, deck } of DECKS) {
  if (only.length && !only.includes(file)) continue;
  const path = join(outDir, `${file}.pptx`);
  writeFileSync(path, await renderHybridDeck(deck));
  console.log(`wrote ${path} (${deck.slides.length} slides)`);
  const scenePath = join(outDir, `${file}.scene.json`);
  writeFileSync(scenePath, `${JSON.stringify(renderDeckScene(deck))}\n`);
  console.log(`wrote ${scenePath}`);

  // Its lesson plan, written from the same deck so its slide numbers match.
  const plan = LESSON_PLANS.find((candidate) => candidate.deck === file);
  if (plan) {
    const planPath = join(outDir, `${file}-lesson-plan.pdf`);
    writeFileSync(planPath, await renderLessonPlan(plan, deck));
    console.log(`wrote ${planPath}`);
  }
}

// The handouts, by file name (without .pdf), which is also how to build one alone.
const HANDOUTS: [string, () => Promise<Uint8Array>][] = [
  ['student-sign-up', renderSignUpHandout],
  ['sample-essay-bored-in-the-usa', renderSampleEssayHandout],
  ['sample-essay-animal-farm', renderAnimalFarmEssayHandout],
  ['critical-essay-form', renderEssayFormHandout],
  ['essay-prompts', renderEssayPromptsHandout],
  ['quoting-and-citing', renderQuotingHandout],
];

for (const [file, render] of HANDOUTS) {
  if (only.length && !only.includes(file)) continue;
  const handoutPath = join(outDir, `${file}.pdf`);
  writeFileSync(handoutPath, await render());
  console.log(`wrote ${handoutPath}`);
}
