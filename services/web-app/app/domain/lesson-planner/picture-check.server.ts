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
import { readLenientJson } from './lenient-json';

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

/** Cut short, never refused: one long sentence must not lose the whole answer. */
const words = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((text) => (text ?? '').trim().slice(0, max));
const Answer = z.object({
  pictures: z.array(
    z.object({
      n: z.coerce.number().int(),
      keep: z.union([
        z.boolean(),
        z
          .string()
          .regex(/^(true|false|yes|no)$/i)
          .transform((text) => /^(true|yes)$/i.test(text)),
      ]),
      alt: words(300),
      why: words(200),
    })
  ),
});

/** The answer's shape, for the API's structured outputs. */
export const SECOND_LOOK_SCHEMA = {
  type: 'object',
  properties: {
    pictures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          keep: { type: 'boolean' },
          alt: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['n', 'keep', 'alt', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['pictures'],
  additionalProperties: false,
} as const;

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
  const answer = readLenientJson(text, Answer);
  if (!answer) return null;
  const verdicts = new Map<number, LookVerdict>();
  for (const entry of answer.pictures) {
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
