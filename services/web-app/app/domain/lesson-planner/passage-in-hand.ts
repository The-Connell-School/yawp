/**
 * No reading without the reading (R9, S1; Nov 24 types test). The Of Mice and
 * Men lesson asked students to "Mark one detail about George and one about
 * Lennie" on a slide that said only "Chapter 1: The Opening… Follow along":
 * no passage on a slide or the handout, and nothing saying where it ran.
 *
 * A read slide that has students mark the text is in order when the passage
 * is in their hands (printed on a slide or the handout, or a labeled slot for
 * the teacher's own pages) or the slide says exactly where it runs (lines,
 * pages, "from … to …"). Otherwise it is a problem for the repair pass, which
 * says where the passage runs and adds the slot; a work still in copyright is
 * never quoted from memory (R24).
 */
import { readLessonMaterials } from './lesson-material';

export type PassageProblem = { what: string; words: string; note: string };

/** A task that has students work on the words of a text. */
const MARKING = /\b(?:mark|underline|circle|annotate|highlight|star|bracket|box|label|note in the margin)\b/i;

/** The slide says where the passage runs. */
const SAYS_WHERE = [
  /\b(?:lines?|ll\.|pages?|pp?\.|paragraphs?|¶|stanzas?)\s*\d/i,
  /\bfrom\b[^.\n]{2,120}?\b(?:to|through|until|up to)\b/i,
  /[“"][^”"\n]{3,80}[”"]\s*(?:…|\.\.\.|to|through)\s*[“"]/,
];

/** A passage printed for students: a run of `>` lines, two or more, or one long one. */
const PRINTED = /(?:^|\n)\s{0,3}>[^\n]{120,}|(?:^|\n)\s{0,3}>[^\n]*\n\s{0,3}>[^\n]*\S/;

/** A labeled slot for the teacher's own copy of the passage. */
const SLOT = /\[[^\]\n]{0,160}\b(?:passage|pages?|excerpt|copy|chapter|text)\b[^\]\n]{0,160}\]/i;

type LooseSlide = { layout?: unknown; title?: unknown; body?: unknown; speakerNotes?: unknown; tasks?: unknown; bullets?: unknown };

/** The deck's slides, read leniently: this check must not depend on the deck validating. */
function deckSlides(reply: string): LooseSlide[] {
  for (const match of reply.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    const inner = match[1] ?? '';
    if (!inner.includes('"slides"')) continue;
    try {
      const raw = JSON.parse(inner) as { slides?: unknown };
      if (Array.isArray(raw.slides)) return raw.slides.filter((slide): slide is LooseSlide => Boolean(slide) && typeof slide === 'object');
    } catch {
      // Not the deck.
    }
  }
  return [];
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function taskWords(slide: LooseSlide): string {
  const tasks = Array.isArray(slide.tasks) ? slide.tasks : [];
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  return [
    ...tasks.map((task) => (task && typeof task === 'object' ? `${text((task as { verb?: unknown }).verb)} ${text((task as { text?: unknown }).text)}` : '')),
    ...bullets.map(text),
  ].join(' ');
}

/** Each read slide whose passage students cannot see, as a problem for the repair pass. */
export function passageNotInHand(reply: string): PassageProblem[] {
  const slides = deckSlides(reply);
  if (!slides.length) return [];
  const printedOnSlide = slides.some((slide) => slide.layout === 'excerpt' && text(slide.body).trim().length >= 40);
  const handouts = readLessonMaterials(reply).materials.map((material) => material.content);
  const inHand = printedOnSlide || handouts.some((content) => PRINTED.test(content) || SLOT.test(content));
  if (inHand) return [];
  const problems: PassageProblem[] = [];
  for (const slide of slides) {
    if (slide.layout !== 'read') continue;
    const where = `${text(slide.title)} ${text(slide.body)} ${text(slide.speakerNotes)}`;
    if (!MARKING.test(`${text(slide.body)} ${taskWords(slide)}`)) continue;
    if (SAYS_WHERE.some((pattern) => pattern.test(where))) continue;
    const title = text(slide.title).trim() || 'reading';
    const body = text(slide.body).trim();
    problems.push({
      what:
        `Students mark the text on the "${title}" slide, but the passage is not in their hands: it is not printed on a slide or the handout, and the slide does not say where it starts and ends. ` +
        'On that slide, say exactly where the passage runs: the chapter, act or section, and where it starts and ends, with page or line numbers if you are sure of them, or else described in your own words. ' +
        'On the handout, add a labeled slot for it: "[The passage: print these pages from your copy of the book.]" ' +
        'Never quote a work still in copyright from memory.',
      words: body || title,
      note: `Students mark the text on “${title}”, but the passage isn't on a slide or the handout. Print it or tell them where it runs before class.`,
    });
  }
  return problems;
}
