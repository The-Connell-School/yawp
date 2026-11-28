/**
 * Never tell students what the work means (R28, with R29; section 2 of the
 * rules). In the Nov 24 types test R28 held in 0 of 8 literature lessons: a
 * Macbeth slide said "The witches do not make Macbeth do anything", its cast
 * slide said Macbeth "Wants recognition — and more", subtitles carried a
 * theme. The rule is in the instructions, and no code can tell a claim about
 * meaning from a fact: a second model reads the words students see, and each
 * place it finds goes to the repair pass, which asks it as a question or
 * moves the claim to the teacher's notes as what to listen for.
 *
 * Literature only (a novel, play, poem or short story): a skill lesson states
 * its rule, and a speech may quote the claim its author makes outright.
 */
import { readFactCheckAnswer, type AskFactChecker } from './fact-check.server';
import { readGenre } from './genre-rules';

export const MEANING_CHECK_SYSTEM = `You read a high school literature lesson before a teacher uses it. In this school, students find what a work means for themselves: the lesson tells them what can be known (who is who, what happens, when and where, what a word means) and asks what can be interpreted. A lesson that tells students the meaning first replaces their reading.

Read only the words students see: slide titles, subtitles and text, cast and "who is who" slides, handouts, class starters, discussion prompts, writing prompts and exit tickets. Never list anything in the teacher's plan, speaker notes or notes to the teacher: there, saying what to listen for is right.

List each place where the words students see tell them what the work means:
- a theme stated as fact ("Ambition destroys", "Power corrupts"), including in a title or subtitle
- what a character wants, fears or is really like, beyond their name, title and relationship ("Wants recognition — and more")
- what a symbol, image, object or setting stands for
- what the author meant or believed about the work's meaning
- a writing prompt that hands students a claim to illustrate ("Ambition costs something. Say what it costs.")
- a plot turn (a twist, a death, the ending) given away before students have read it

Do not list, and never list a question of any kind: a question asks, it does not tell. Never list words that say "seems", "might", "may" or "perhaps"; facts, definitions of terms, or a sentence starter; what happens in the pages students have already read in this lesson (a plot summary after the reading is a fact, not a claim); or anything outside what students see. When in doubt, leave it out: a sentence that tells students the meaning is rare, and changing a good prompt does harm.

For each:
- "wrong": the words, copied exactly, character for character, as short as possible but long enough to occur only once in the lesson. Never a code-fence line, a link or a JSON key.
- "right": the same place rewritten so it asks instead of tells (often as a question), or as a plain fact, in the lesson's own voice and format, so it can replace "wrong" directly.
- "confidence": "high" only when any English teacher would agree it tells students the meaning; otherwise "medium". Only "high" is acted on.
- "why": one short sentence a teacher can read.

Answer with JSON only:
{"errors": [{"wrong": "<exact words>", "right": "<rewritten words>", "confidence": "high" | "medium", "why": "<one sentence>"}]}
If there are none, answer {"errors": []}.`;

const MAX_REPLY = 60_000;

const LITERATURE = new Set(['novel', 'play', 'poem', 'story']);

/** Whether the lesson is a reading of literature: the latest message that says, else an earlier one. */
export function isLiterature(messages: string[]): boolean {
  const genre = readGenre(messages);
  return genre !== null && LITERATURE.has(genre);
}

/** "This is not an error, so ignore it": the reader's own note that it is fine. */
const NOT_ONE = /\bnot (?:a|an) (?:real |actual )?(?:error|problem|issue)\b|\b(?:so )?ignore (?:it|this)\b|\bis fine as written\b|\b(?:correct|right|fine) as written\b|\bno change needed\b/i;

/** A question, or words that already hedge: these ask, they do not tell. */
const ASKS = /\?\s*["”’']?\s*$|\b(?:seems?|seemed|might|may|perhaps|possibly)\b/i;

export type MeaningProblem = { what: string; words: string; right: string; note: string };

/** Each place the words students see tell them what the work means, as a problem for the repair pass. */
export async function meaningProblems(reply: string, ask: AskFactChecker): Promise<MeaningProblem[]> {
  if (!reply.trim()) return [];
  const lesson = reply.length > MAX_REPLY ? `${reply.slice(0, MAX_REPLY)}\n[…]` : reply;
  let answer: string;
  try {
    answer = await ask(MEANING_CHECK_SYSTEM, `The lesson:\n\n<lesson>\n${lesson}\n</lesson>`);
  } catch {
    return [];
  }
  try {
    const escaped = (words: string) => JSON.stringify(words).slice(1, -1);
    const seen = new Set<string>();
    return readFactCheckAnswer(answer)
      // Sure finds only (fiction run, Nov 28: most finds were false alarms, and their repairs changed good prompts).
      .filter((found) => found.confidence === 'high' && !NOT_ONE.test(found.why))
      .filter((found) => !ASKS.test(found.wrong))
      .filter((found) => reply.includes(found.wrong) || reply.includes(escaped(found.wrong)))
      .filter((found) => !seen.has(found.wrong.trim()) && Boolean(seen.add(found.wrong.trim())))
      .map((found) => ({
        what: `${found.why || 'These words tell students what the work means.'} Rewrite them so they ask instead of tell (often as a question), or as a plain fact; the claim itself belongs in the teacher's notes, as what to listen for. Change every place students see it.`,
        words: found.wrong,
        right: found.right,
        // No note: an unfixed false alarm in "Check before class" does more harm than good (Nov 28).
        note: '',
      }));
  } catch {
    return [];
  }
}
