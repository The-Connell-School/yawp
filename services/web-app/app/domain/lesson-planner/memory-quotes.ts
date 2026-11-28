/**
 * Never quoted from memory (R24; fiction run, Nov 28). Yawp! checks quotations
 * only against a work it holds (a registered public-domain text, or the
 * teacher's own pages). For every other work, whatever a handout printed came
 * from the planner's memory: To Kill a Mockingbird's handout printed recalled
 * passages, one labeled "paraphrased from memory", and The Outsiders printed
 * about 180 recalled words with a sentence repeated.
 *
 * In a literature lesson whose work could not be checked, a passage printed
 * for students goes to the repair pass, which puts a labeled slot in its place
 * that says exactly where the passage runs, keeping it only for a work in the
 * public domain whose edition it names. What it cannot fix is a note for the
 * teacher to compare it with their copy.
 */
import { readLessonMaterials } from './lesson-material';
import { proseRuns } from './passage-in-hand';

export type MemoryProblem = { what: string; words: string; note: string };

const MIN_WORDS = 30;
const OWN_WRITING = /\b(?:model|sample|practice|mentor text|written for|yawp!? wrote)\b/i;
const words = (text: string) => (text.match(/[\p{L}’']+/gu) ?? []).length;

/** The passages a handout prints: quoted runs and plain paragraphs. */
function printed(content: string): string[] {
  const quoted = content
    .split(/\n[ \t]*\n/)
    .filter((block) => block.split('\n').every((line) => /^\s{0,3}>/.test(line)))
    .map((block) => block.replace(/^\s{0,3}>\s?/gm, '').trim());
  return [...quoted, ...proseRuns(content)].filter((text) => words(text) >= MIN_WORDS);
}

export function printedFromMemory(reply: string, { checked, literature }: { checked: boolean; literature: boolean }): MemoryProblem[] {
  if (checked || !literature) return [];
  const passages = readLessonMaterials(reply)
    .materials.filter((material) => !OWN_WRITING.test(material.title))
    .flatMap((material) => printed(material.content));
  if (!passages.length) return [];
  const first = passages[0]!.split('\n')[0]!.replace(/^["“]/, '');
  const anchor = first.slice(0, Math.min(first.length, 90));
  return [
    {
      what:
        `The handout prints ${passages.length === 1 ? 'a passage' : `${passages.length} passages`} of the work that Yawp! could not check against the book, so ${passages.length === 1 ? 'it was' : 'they were'} written from memory. ` +
        'A work still in copyright is never quoted from memory: replace each with a labeled slot that says exactly where it runs, by chapter and the moment it starts and ends ("[The passage: chapter 10, from where Atticus takes the rifle to the dog falling; print it from your copy.]"), and keep the questions about it. ' +
        'Keep a printed passage only if the work is in the public domain and the handout names the edition it is from.',
      words: anchor,
      note: `A passage on the handout was printed from memory and could not be checked: compare it with your copy, or print the pages instead.`,
    },
  ];
}
