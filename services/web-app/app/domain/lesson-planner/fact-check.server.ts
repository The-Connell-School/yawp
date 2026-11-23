/**
 * The fact check (Nov 22; lesson review pattern 2, the plan's item 2(c)): a
 * second model reads the planner's reply for errors of fact about the text
 * and its history. In 13 of 13 lessons reviewed there was one: the Crucible
 * trials "ending" in October 1692, The Odyssey's "twelve men on that raft"
 * (six survive; they escape by ship), lines of 1984 given to the wrong
 * speaker, Gatsby's chapter 3 line taught as chapter 1.
 *
 * The model answers in JSON: each error as the exact words of the reply that
 * are wrong, the words that should stand in their place, and how sure it is.
 * A sure correction is made in place when its words are short and occur once
 * in the reply's prose; anything less sure, or that cannot be placed, goes
 * to the teacher as "check before class". Any failure (no answer, an answer
 * that cannot be read) gives the reply back as it was.
 *
 * The call is injected, as for the picture editor (picture-subjects.server.ts):
 * the route chooses the model.
 */
import { z } from 'zod';
import { readLenientJson } from './lenient-json';

export const FACT_CHECK_SYSTEM = `You check a high school English lesson for errors of fact before a teacher uses it with students. A wrong fact that students learn first keeps shaping their thinking after it is corrected, and a teacher who finds one error stops trusting the rest.

List only errors of fact about the literary work, its author and its history:
- wrong dates or ages (of the work, the author, the events it depicts or draws on)
- a line or action given to the wrong character (who says it, who does it)
- a quotation placed in the wrong chapter, act, scene or book, or attributed to the wrong work or author
- plot errors: events, numbers, places, names, relationships, the order of events, who survives
- a famous line misquoted, when you are certain of the exact words
- wrong historical or biographical context

Do not list anything that is right as written, even to add a detail. Do not list: teaching choices, style, tone, interpretations or debatable readings, line or page numbers that depend on the edition, spelling variants between editions, or anything you are not sure is wrong.

For each error:
- "wrong": the words of the lesson that are wrong, copied exactly, character for character, as short as possible (a phrase, at most one sentence) but long enough to occur only once in the lesson. Never the lesson's code-fence lines, links or JSON keys.
- "right": the words to put in their place: the same passage corrected, in the lesson's own voice and format, so it can replace "wrong" directly.
- "confidence": "high" when you are certain of both the error and the correction and any scholar of the work would agree (most wrong dates, names, chapters and speakers are this); "medium" when the correction itself is uncertain.
- "why": one short sentence a teacher can check, naming where in the work the fact is (chapter, act and scene, book).

Answer with JSON only, no other text:
{"errors": [{"wrong": "<exact words>", "right": "<corrected words>", "confidence": "high" | "medium", "why": "<one sentence>"}]}
If there are no errors, answer {"errors": []}.`;

/** The answer's shape, for the API's structured outputs. */
export const FACT_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          wrong: { type: 'string' },
          right: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium'] },
          why: { type: 'string' },
        },
        required: ['wrong', 'right', 'confidence', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['errors'],
  additionalProperties: false,
} as const;

const Answer = z.object({
  errors: z.array(
    z.object({
      wrong: z.string(),
      right: z.string(),
      confidence: z
        .string()
        .transform((value) => value.trim().toLowerCase())
        .pipe(z.enum(['high', 'medium', 'low'])),
      why: z.string().optional().default(''),
    })
  ),
});

export type FactError = { wrong: string; right: string; why: string };

export type FactCheck = {
  reply: string;
  /** Made in place. */
  applied: FactError[];
  /** For the teacher: "check before class". */
  flagged: FactError[];
};

export type AskFactChecker = (
  system: string,
  prompt: string
) => Promise<string>;

const MAX_WRONG = 200;
const MAX_RIGHT = 400;
const MAX_ERRORS = 16;
const MAX_REPLY = 60_000;

/** What the checker is shown: the lesson, whole. */
export function factCheckPrompt(reply: string): string {
  const lesson =
    reply.length > MAX_REPLY ? `${reply.slice(0, MAX_REPLY)}\n[…]` : reply;
  return `The lesson:\n\n<lesson>\n${lesson}\n</lesson>`;
}

/** The checker's answer, read leniently. Anything that cannot be read is no errors. */
export function readFactCheckAnswer(
  text: string
): Array<FactError & { confidence: 'high' | 'medium' | 'low' }> {
  const answer = readLenientJson(text, Answer);
  if (!answer) return [];
  return answer.errors.slice(0, MAX_ERRORS).flatMap((entry) => {
    const wrong = entry.wrong;
    const right = entry.right;
    if (!wrong.trim() || wrong === right) return [];
    return [
      {
        wrong,
        right,
        why: entry.why.trim().slice(0, 300),
        confidence: entry.confidence,
      },
    ];
  });
}

/** Every place the words occur in the text. */
function placesOf(text: string, words: string): number[] {
  const places: number[] = [];
  for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + 1))
    places.push(at);
  return places;
}

export type Fence = { start: number; end: number; lang: string; headerEnd: number };

export function fencesOf(reply: string): Fence[] {
  const fences: Fence[] = [];
  const open = /^```([\w-]*)[^\n]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = open.exec(reply))) {
    const headerEnd = match.index + match[0].length;
    const close = reply.indexOf('\n```', headerEnd);
    const end = close < 0 ? reply.length : close + 4;
    fences.push({ start: match.index, end, lang: match[1], headerEnd });
    open.lastIndex = end;
  }
  return fences;
}

/** Whether the words at this place are in a link, an address, or a fence's own line. */
function inFurniture(
  reply: string,
  at: number,
  length: number,
  fences: Fence[]
): boolean {
  for (const fence of fences) {
    if (at < fence.headerEnd && at + length > fence.start) return true;
    if (at < fence.end && at + length > fence.end - 3) return true;
  }
  const lineStart = reply.lastIndexOf('\n', at - 1) + 1;
  const lineEnd = reply.indexOf('\n', at + length);
  const line = reply.slice(lineStart, lineEnd < 0 ? reply.length : lineEnd);
  const from = at - lineStart;
  // An address: a run of non-space characters with "://" or "www." that the words touch.
  for (const token of line.matchAll(/\S+/g)) {
    const s = token.index ?? 0;
    const e = s + token[0].length;
    if (s < from + length && from < e && /:\/\/|www\.|\]\(/.test(token[0]))
      return true;
  }
  // The address half of a markdown link.
  const before = line.slice(0, from);
  if (/\]\([^)]*$/.test(before)) return true;
  return false;
}

/** The fence the place is inside, if any. */
const fenceAt = (fences: Fence[], at: number) =>
  fences.find((fence) => at > fence.headerEnd && at < fence.end);

/**
 * The reply with the checker's sure corrections made, and the rest listed
 * for the teacher. A correction is made only when its words are under 200
 * characters and occur exactly once in the reply, in its prose (not a link,
 * an address or a fence's own line), and do not touch a quotation the
 * quotation check verified against the source (`protect`). Inside a slide
 * deck's JSON the words are matched and replaced as the JSON writes them.
 */
export async function withFactCheck(
  reply: string,
  ask: AskFactChecker,
  { protect = [] }: { protect?: string[] } = {}
): Promise<FactCheck> {
  const unchanged: FactCheck = { reply, applied: [], flagged: [] };
  if (!reply.trim()) return unchanged;
  let answer: string;
  try {
    answer = await ask(FACT_CHECK_SYSTEM, factCheckPrompt(reply));
  } catch {
    return unchanged;
  }
  try {
    const errors = readFactCheckAnswer(answer);
    if (!errors.length) return unchanged;
    const fences = fencesOf(reply);
    const kept = protect
      .filter((text) => text.trim().length >= 12)
      .flatMap((text) =>
        placesOf(reply, text).map((at) => ({
          start: at,
          end: at + text.length,
        }))
      );
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const applied: FactError[] = [];
    const flagged: FactError[] = [];
    for (const error of errors) {
      const { confidence, ...fact } = error;
      if (confidence === 'low') continue;
      if (notAnError(fact)) continue;
      const placed =
        confidence === 'high' ? placeEdits(reply, fact, fences) : null;
      const clashes =
        placed &&
        placed.some((edit) =>
          [...kept, ...edits].some(
            (span) => edit.start < span.end && span.start < edit.end
          )
        );
      if (placed && !clashes) {
        edits.push(...placed);
        applied.push(fact);
      } else flagged.push(fact);
    }
    let out = reply;
    for (const edit of [...edits].sort((a, b) => b.start - a.start))
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    return { reply: out, applied, flagged };
  } catch {
    return unchanged;
  }
}

/**
 * A "fact" the checker itself says is right as written ("the 1956 date is
 * correct… only a clarification"): not an error, so neither made nor shown
 * (re-test, Nov 22: such notes filled the teacher's "check before class").
 */
// A note that says it is not an error is not one for the teacher (Kevin, Nov 23:
// "this is not a real error, so ignore" under Check before class).
function notAnError({ why }: FactError): boolean {
  return /\b(?:is|are) (?:correct|accurate|right) as written\b|\bwording is fine\b|\bonly a clarification\b|\bno (?:change|correction) (?:is )?needed\b|\bthis is accurate\b|\bnot a clear error\b|\bslightly loose\b|\bnot (?:a|an) (?:real |actual |factual |true )?error\b|\bso ignore\b|\b(?:can|may|should) (?:safely )?be ignored\b|\bignore (?:it|this)\b/i.test(why);
}

/** The most places one sure correction is made: the plan and its slide often say the same thing. */
const MAX_PLACES = 3;

/**
 * Where a sure correction goes, as the reply writes its words at each place
 * (the plan's prose and the deck's JSON often both say it: re-test, Nov 22,
 * a fact flagged and left on the slide); or null when any place is unsafe.
 */
export function placeEdits(
  reply: string,
  { wrong, right }: Pick<FactError, 'wrong' | 'right'>,
  fences: Fence[],
  { maxWrong = MAX_WRONG, maxRight = MAX_RIGHT }: { maxWrong?: number; maxRight?: number } = {}
): Array<{ start: number; end: number; text: string }> | null {
  if (wrong.length >= maxWrong || right.length > maxRight || !right.trim())
    return null;
  if (/```/.test(right) || /```/.test(wrong)) return null;
  // As written, and as a JSON string writes it (a quotation mark inside a slide is \").
  const escaped = JSON.stringify(wrong).slice(1, -1);
  const forms = [...new Set([wrong, escaped])];
  const places = forms.flatMap((form) =>
    placesOf(reply, form).map((at) => ({ at, form }))
  );
  // Overlapping hits of the two forms are one place.
  const distinct = places.filter(
    (p, i) =>
      !places
        .slice(0, i)
        .some(
          (q) => Math.abs(q.at - p.at) < Math.max(q.form.length, p.form.length)
        )
  );
  if (!distinct.length || distinct.length > MAX_PLACES) return null;
  // Short words found more than once may mean different things in different places.
  if (distinct.length > 1 && wrong.trim().split(/\s+/).length < 4) return null;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const { at, form } of distinct) {
    if (inFurniture(reply, at, form.length, fences)) return null;
    const fence = fenceAt(fences, at);
    const json = fence?.lang === 'yawp-slides';
    if (json && form === wrong && wrong !== escaped) return null;
    // A correction inside JSON may not break out of its string.
    if (json && /\n/.test(right)) return null;
    edits.push({ start: at, end: at + form.length, text: json ? JSON.stringify(right).slice(1, -1) : right });
  }
  return edits;
}
