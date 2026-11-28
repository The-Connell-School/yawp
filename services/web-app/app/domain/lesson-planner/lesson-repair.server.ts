/**
 * Fix it, don't flag it (plan item 1, Nov 22). In round 3 of the 13-lesson
 * test, four lessons shipped errors the planner's own checks had found:
 * Gatsby's "one of the few honest people" taught as chapter 1 (it closes
 * chapter 3), Harper Lee's birth year, the protectorate's date, Owen's age.
 * A correction was made only where the wrong words could be swapped one for
 * one; where the lesson was built on the error (a think-aloud, a slide, the
 * Short Response), it went to "Check before class" and stayed on screen.
 *
 * Here a model is given the reply and what the checks found, and answers with
 * edits: an exact span of the reply and what goes in its place. Each edit is
 * placed with the fact check's own rules (exact words, as the deck's JSON
 * writes them, never in a fence line, never over a quotation the source text
 * verified). A deck that built before must still build. What could not be
 * repaired goes back to the teacher's note. Any failure: the reply as it was.
 */
import { z } from 'zod';
import { fencesOf, placeEdits } from './fact-check.server';
import { readLenientJson } from './lenient-json';
import { readSlideDeck } from './slide-deck';

export type Problem = {
  /** What is wrong, for the model and for the teacher's note. */
  what: string;
  /** The words of the reply it is about, when known. */
  words?: string;
  /** The correction, when known. */
  right?: string;
};

export const LESSON_REPAIR_SYSTEM = `You repair a high school English lesson before a teacher uses it. Checks have found errors in it; each is listed with a number. The lesson may rely on an error in several places: the plan's prose, a teacher's think-aloud, a slide, a handout, a writing prompt. Fix every place, so nothing in the lesson still teaches the error.

How to fix:
- Change as little as you can: the words that are wrong and what depends on them. Keep the lesson's design, voice and format.
- A quotation placed in the wrong chapter, act or scene: say where it really is ("Nick says it at the end of chapter 3"). If the lesson's task depends on it being in the passage students read today, rewrite the task around a line that is in today's passage, or say that the line comes later.
- A wrong fact: put the right fact in its place.
- Never invent a quotation. Quote only words you are certain are the author's, or describe instead of quoting.

Answer with JSON only. Each edit:
- "problem": the number of the error it fixes.
- "find": words of the lesson copied exactly, character for character, as short as possible but long enough to occur only where you mean (at most two sentences). Never a code-fence line, a link or a JSON key.
- "replace": the words to put in their place, in the lesson's own voice and format.
{"edits": [{"problem": 1, "find": "<exact words>", "replace": "<new words>"}]}
If an error is not in the lesson after all, give no edit for it.`;

export const LESSON_REPAIR_SCHEMA = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          problem: { type: 'integer' },
          find: { type: 'string' },
          replace: { type: 'string' },
        },
        required: ['problem', 'find', 'replace'],
        additionalProperties: false,
      },
    },
  },
  required: ['edits'],
  additionalProperties: false,
} as const;

const Answer = z.object({
  edits: z.array(
    z.object({
      problem: z.coerce.number().int(),
      find: z.string(),
      replace: z.string(),
    })
  ),
});

export type AskRepairer = (system: string, prompt: string) => Promise<string>;

const MAX_PROBLEMS = 8;
const MAX_EDITS = 24;
const MAX_FIND = 600;
const MAX_REPLACE = 800;
const MAX_REPLY = 60_000;

/** What the repairer is shown: the errors, numbered, then the lesson whole. */
export function lessonRepairPrompt(reply: string, problems: Problem[]): string {
  const list = problems
    .map((problem, i) => {
      const parts = [`${i + 1}. ${problem.what}`];
      if (problem.words) parts.push(`   The lesson's words: "${problem.words}"`);
      if (problem.right) parts.push(`   Right: ${problem.right}`);
      return parts.join('\n');
    })
    .join('\n');
  const lesson = reply.length > MAX_REPLY ? `${reply.slice(0, MAX_REPLY)}\n[…]` : reply;
  return `The errors:\n${list}\n\nThe lesson:\n\n<lesson>\n${lesson}\n</lesson>`;
}

export type LessonRepair = {
  reply: string;
  /** The problems at least one edit fixed. */
  repaired: Problem[];
  /** The rest: for the teacher's note. */
  left: Problem[];
};

/** The reply with the problems repaired where they can be; anything uncertain is left, and listed. */
export async function withLessonRepair(
  reply: string,
  problems: Problem[],
  ask: AskRepairer,
  { protect = [] }: { protect?: string[] } = {}
): Promise<LessonRepair> {
  const list = problems.slice(0, MAX_PROBLEMS);
  const unchanged: LessonRepair = { reply, repaired: [], left: problems };
  if (!list.length) return unchanged;
  let answer: string;
  try {
    answer = await ask(LESSON_REPAIR_SYSTEM, lessonRepairPrompt(reply, list));
  } catch {
    return unchanged;
  }
  try {
    const read = readLenientJson(answer, Answer);
    if (!read) return unchanged;
    const fences = fencesOf(reply);
    const kept = protect
      .filter((text) => text.trim().length >= 12)
      .flatMap((text) => {
        const spans: Array<{ start: number; end: number }> = [];
        for (let at = reply.indexOf(text); at >= 0; at = reply.indexOf(text, at + 1)) spans.push({ start: at, end: at + text.length });
        return spans;
      });
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const fixed = new Set<number>();
    for (const edit of read.edits.slice(0, MAX_EDITS)) {
      const index = edit.problem - 1;
      if (index < 0 || index >= list.length || !edit.find.trim() || edit.find === edit.replace) continue;
      const placed = placeEdits(reply, { wrong: edit.find, right: edit.replace }, fences, { maxWrong: MAX_FIND, maxRight: MAX_REPLACE });
      if (!placed) continue;
      const clashes = placed.some((p) => [...kept, ...edits].some((span) => p.start < span.end && span.start < p.end));
      if (clashes) continue;
      edits.push(...placed);
      fixed.add(index);
    }
    if (!edits.length) return unchanged;
    let out = reply;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    // Never trade a deck that builds for one that does not.
    if (readSlideDeck(reply).kind === 'deck' && readSlideDeck(out).kind !== 'deck') return unchanged;
    return {
      reply: out,
      repaired: list.filter((_, i) => fixed.has(i)),
      left: [...list.filter((_, i) => !fixed.has(i)), ...problems.slice(MAX_PROBLEMS)],
    };
  } catch {
    return unchanged;
  }
}
