/**
 * The passage's hard words glossed where students meet them (R5, S5; Nov 24
 * types test). The instructions already say so, and the lessons still missed
 * it: "Ozymandias" printed the poem with antique, trunkless, visage and
 * mocked glossed nowhere; Macbeth's define slide taught thane, weird and
 * prophecy, none of which is in the scene students read, and left hurlyburly,
 * heath and anon; the Gettysburg Address defined ethos and left hallow and
 * consecrate.
 *
 * A lesson that prints a passage of a work (an excerpt slide naming it, or a
 * quoted passage on the handout over its source line) and glosses none of the
 * passage's own words is a problem for the repair pass, which adds a short
 * "Words to know" line under the passage on the handout. Choosing the words is
 * the repairer's; finding that none are glossed is this check's.
 */
import { readLessonMaterials } from './lesson-material';
import { deckSlides, type PassageProblem } from './passage-in-hand';

const MIN_WORDS = 40;
/** A passage the lesson wrote itself, not a work's. */
const OWN_WRITING = /\b(?:model|sample|practice|yawp!?|mentor text|written for)\b/i;
/** A handout's gloss list, or a gloss beside a word. */
const GLOSS_LIST = /\b(?:words to know|glossary|vocabulary|word bank|key words|words for)\b|\(\s*=\s*\w|\(\s*(?:means|meaning)\b/i;
/** "— Percy Bysshe Shelley, "Ozymandias"": the line naming where a passage is from. */
const SOURCE_LINE = /^\s*(?:[—–]|-{1,2}\s)\s*\S.{2,160}$/;

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const wordCount = (value: string) => (value.match(/[\p{L}’']+/gu) ?? []).length;
const wordsIn = (value: string) => new Set((value.toLowerCase().match(/[\p{L}]+(?:['’][\p{L}]+)*/gu) ?? []).map((w) => w.replace(/['’]s$/, '')));

type Passage = { text: string; work: string; anchor: string };

/** Passages of a work the lesson prints: on excerpt slides and quoted on its handouts. */
function printedPassages(reply: string): { passages: Passage[]; handouts: string[] } {
  const passages: Passage[] = [];
  for (const slide of deckSlides(reply) as Array<Record<string, unknown>>) {
    if (slide.layout !== 'excerpt') continue;
    const body = text(slide.body);
    const work = text(slide.work) || text(slide.author);
    if (!work || OWN_WRITING.test(work) || wordCount(body) < MIN_WORDS) continue;
    passages.push({ text: body, work, anchor: text(slide.title) || work });
  }
  const handouts = readLessonMaterials(reply).materials.map((material) => material.content);
  for (const content of handouts) {
    const blocks = content.split(/\n[ \t]*\n/);
    blocks.forEach((block, index) => {
      const lines = block.split('\n');
      if (!lines.every((line) => /^\s{0,3}>/.test(line))) return;
      const quoted = lines.map((line) => line.replace(/^\s{0,3}>\s?/, '')).join('\n');
      const source = (blocks[index + 1] ?? '').split('\n')[0] ?? '';
      if (wordCount(quoted) < MIN_WORDS || !SOURCE_LINE.test(source) || OWN_WRITING.test(source)) return;
      passages.push({ text: quoted, work: source.replace(/^\s*(?:[—–]|-{1,2})\s*/, '').trim(), anchor: source.trim() });
    });
  }
  return { passages, handouts };
}

/** A problem for each lesson whose printed passage has none of its words glossed. */
export function passageWithoutGlosses(reply: string): PassageProblem[] {
  const { passages, handouts } = printedPassages(reply);
  if (!passages.length) return [];
  if (handouts.some((content) => GLOSS_LIST.test(content))) return [];
  const defined = (deckSlides(reply) as Array<Record<string, unknown>>)
    .filter((slide) => slide.layout === 'define' && Array.isArray(slide.terms))
    .flatMap((slide) => (slide.terms as unknown[]).map((term) => text((term as { word?: unknown } | null)?.word).toLowerCase().trim()))
    .filter(Boolean);
  const inPassage = (word: string) => passages.some((passage) => word.split(/\s+/).every((part) => wordsIn(passage.text).has(part)));
  if (defined.some(inPassage)) return [];
  // One problem for the lesson: the repairer glosses each passage it prints,
  // under the handout's passage when there is one.
  const first = passages.find((passage) => SOURCE_LINE.test(passage.anchor)) ?? passages[0]!;
  const work = first.work.replace(/[“”"*_]/g, '').trim();
  return [
    {
      what:
        `The lesson prints a passage of ${work} but glosses none of its hard words. ` +
        'Under the passage on the handout, add one line, "Words to know:", glossing up to six words of the passage a student of this grade may not know (archaic, technical, dialect, of the period), each with a short plain meaning as it is used here. ' +
        'Gloss only words that are in the passage, and never change the passage itself.',
      words: first.anchor,
      note: `No word of the passage from ${work} is glossed. Add its hard words to the handout before class.`,
    },
  ];
}
