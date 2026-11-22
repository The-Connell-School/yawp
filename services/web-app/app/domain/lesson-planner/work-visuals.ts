/**
 * Pictures from a work's own world (Kevin, Nov 22).
 *
 * Decks for literature lessons came back with few pictures, no portrait of
 * the author, and pictures from the wrong world: a modern rescue team for
 * "Gas mask", Chartres cathedral for "Porch". A picture is found by the exact
 * title of a Wikipedia article and is that article's lead image, and a
 * general article has a general lead image. So for the most-taught works
 * there is a hand-chosen kit (work-visuals-data.ts): specific articles whose
 * lead image is a true picture of the work's place, time, people and scenes.
 *
 * This file finds the kit a request or a deck title is about, and writes the
 * kit as a short menu the planner can choose from.
 */
import { WORK_VISUAL_KITS, type WorkVisualKit } from './work-visuals-data';

export type { WorkVisual, WorkVisualKit } from './work-visuals-data';
export { WORK_VISUAL_KITS } from './work-visuals-data';

/**
 * Lower-case words with single spaces between them and one at each end, so a
 * phrase is found only as whole words: "night" is not in " midnight ", and
 * "hamlet" is in " hamlet s to be or not to be ".
 */
function words(text: string): string {
  const plain = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${plain} `;
}

/**
 * The kit for the work a request or a deck title names, or null. When the
 * text names several, the longest name wins ("a midsummer night's dream"
 * over anything shorter); between equals, the first in the list.
 */
export function visualKitFor(text: string): WorkVisualKit | null {
  const haystack = words(text);
  if (haystack.trim() === '') return null;
  let best: WorkVisualKit | null = null;
  let bestLength = 0;
  for (const kit of WORK_VISUAL_KITS) {
    for (const match of kit.match) {
      const needle = words(match);
      // The length of the name as words, not as typed: punctuation does not count.
      const length = needle.length - 2;
      if (length > bestLength && haystack.includes(needle)) {
        best = kit;
        bestLength = length;
      }
    }
  }
  return best;
}

/** The kit as a menu for a prompt, one picture a line: `- <subject> — <shows> (<use>)`. */
export function kitMenu(kit: WorkVisualKit): string {
  return kit.visuals.map((visual) => `- ${visual.subject} — ${visual.shows} (${visual.use})`).join('\n');
}
