/**
 * The second look (Nov 22, night; D4 in the pictures plan): before a found
 * picture is kept, a small model sees it beside what the slide asked for and
 * keeps it or not, and writes its alt text from what is actually in it.
 *
 * The rules in the lookup catch what they were written for (a county map, a
 * film poster, a novel's cover for its characters); this catches what no one
 * has seen yet. If the look fails, the rule-checked pictures are kept and
 * said to be unchecked: the step never takes every picture away because the
 * model was unavailable.
 */
import { z } from 'zod';

export type LookCandidate = {
  n: number;
  subject: string;
  shows?: string;
  /** What the slide says, as the teacher will project it. */
  words?: string;
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
};
export type LookVerdict = { keep: boolean; alt?: string; why?: string };
/** One request to the model: a system prompt and the user turn's content blocks; its text answer back. */
export type LookAt = (
  system: string,
  content: Array<Record<string, unknown>>
) => Promise<string>;

export const SECOND_LOOK_SYSTEM = `You check pictures before they go on the slides of a lesson a teacher will project to a class of teenagers. Each picture was found for a subject; the slide's words are given. A wrong picture is worse than none.

For each picture decide "keep": true only if all of these hold:
- It shows the subject itself: a portrait or photograph of the person; the place; the event or what it left; the object, building, document or artwork. A book's cover only when the subject is the book; a film poster only when the subject is the film. Not a different person, place or thing that shares the name, and not something merely nearby or related.
- It would read when projected: not a page of small type, a blank, a logo, or a tiny detail.
- It is fit for school: no graphic violence, gore, corpses or nudity. Never keep a photograph of an atrocity or its victims; a teacher chooses those.

For each picture also write "alt": one plain sentence saying what is actually in the picture, for a student who cannot see it. When you do not keep it, write "why": a few words.

Answer with JSON only, no other text:
{"pictures": [{"n": <number>, "keep": true or false, "alt": "<sentence>", "why": "<reason, when not kept>"}]}`;

const Answer = z.object({
  pictures: z.array(
    z.object({
      n: z.number().int(),
      keep: z.boolean(),
      alt: z.string().trim().max(400).nullable().optional(),
      why: z.string().trim().max(200).nullable().optional(),
    })
  ),
});

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/** The user turn: for each picture, what it was found for, then the picture; then the question. */
export function secondLookContent(
  candidates: LookCandidate[]
): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    const lines = [`Picture ${candidate.n}. Subject: ${candidate.subject}.`];
    if (candidate.shows) lines.push(`It should show: ${candidate.shows}.`);
    if (candidate.words) lines.push(`The slide says: ${candidate.words}`);
    content.push({ type: 'text', text: lines.join(' ') });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: candidate.contentType,
        data: base64(candidate.bytes),
      },
    });
  }
  content.push({
    type: 'text',
    text: `Check each of the ${candidates.length} pictures above. JSON only.`,
  });
  return content;
}

/** The verdicts, read leniently: the first JSON object in the answer, checked. Nothing readable is no verdict at all. */
export function readSecondLookAnswer(
  text: string
): Map<number, LookVerdict> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const answer = Answer.safeParse(parsed);
  if (!answer.success) return null;
  const verdicts = new Map<number, LookVerdict>();
  for (const entry of answer.data.pictures) {
    if (verdicts.has(entry.n)) continue;
    verdicts.set(entry.n, {
      keep: entry.keep,
      ...(entry.alt ? { alt: entry.alt } : {}),
      ...(entry.why ? { why: entry.why } : {}),
    });
  }
  return verdicts;
}

/**
 * Each picture's verdict, by its number; or null when the look could not be
 * had (the pictures then stand as the rules left them). A picture the answer
 * says nothing about is kept: it passed the rules.
 */
export async function secondLook(
  candidates: LookCandidate[],
  look: LookAt
): Promise<Map<number, LookVerdict> | null> {
  if (!candidates.length) return new Map();
  let answer: string;
  try {
    answer = await look(SECOND_LOOK_SYSTEM, secondLookContent(candidates));
  } catch {
    return null;
  }
  const verdicts = readSecondLookAnswer(answer);
  if (!verdicts) return null;
  for (const candidate of candidates)
    if (!verdicts.has(candidate.n)) verdicts.set(candidate.n, { keep: true });
  return verdicts;
}
