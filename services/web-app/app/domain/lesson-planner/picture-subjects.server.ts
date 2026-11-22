/**
 * The picture editor (Nov 22, night): a subject for every teaching slide.
 *
 * The planner is asked to say what picture belongs on each teaching slide,
 * and on the live preview it asked on two of fourteen. After the reply, a
 * small fast model reads the deck and names, for each teaching slide that
 * asks for nothing, the English Wikipedia article about the concrete thing
 * the slide is about (or nothing, for a slide about an idea). What it names
 * is written into the deck as the slide's `wants`, and the lookup finds it
 * like any other. See docs/plans/2026-11-22-picture-editor-build-plan.md.
 */
import { z } from 'zod';
import type { Slide, SlideDeck } from './slide-deck';

/** Slides that teach something a picture can show. Routine slides (agenda, write, exit…) never ask. */
const TEACHING = new Set<Slide['layout']>([
  'notes',
  'big_idea',
  'look',
  'discuss',
  'picture',
]);
const MAX_SLIDES = 12;
const MAX_WORDS = 400;

export const PICTURE_EDITOR_SYSTEM = `You pick the picture for each slide of a lesson deck a teacher will project, so students remember what they read by also seeing it (dual coding).

For each slide you are given, name the exact title of the English Wikipedia article about the concrete thing the slide is about: a real person, place, event, object, building, document or work of art whose picture would help a student remember the slide. Its lead picture will be shown beside the slide's words.

Rules:
- The specific thing, never a general topic. "Levittown, New York", not "Suburb" or "Postwar America". "Dust Bowl", not "Drought".
- Real things only. A character in a novel has no photograph: name the real person, place or event the slide points to, or nothing.
- Never the film of the book being taught.
- When the slide is about an idea, a feeling, the students or the lesson itself, and no real thing stands for it, give null. A wrong picture is worse than none.
- "shows": a few words on what the picture should show.

Answer with JSON only, no other text:
{"slides": [{"slide": <number>, "subject": "<article title>" or null, "shows": "<what it shows>"}]}`;

const Answer = z.object({
  slides: z.array(
    z.object({
      slide: z.number().int(),
      subject: z.string().trim().max(120).nullable().optional(),
      shows: z.string().trim().max(160).nullable().optional(),
    })
  ),
});

/** The words a slide teaches with, as the editor reads them. */
function slideWords(slide: Slide): string {
  const parts = [
    slide.subtitle,
    slide.body,
    ...(slide.facts ?? []),
    ...(slide.bullets ?? []),
    slide.question,
    slide.stem,
    slide.followUp,
  ];
  const text = parts
    .filter(
      (part): part is string => typeof part === 'string' && Boolean(part.trim())
    )
    .join(' ');
  return text.length > MAX_WORDS ? `${text.slice(0, MAX_WORDS - 1)}…` : text;
}

/** The deck's teaching slides that have no picture and ask for none, by their number in the deck (1-based). */
export function slidesWithoutSubjects(
  deck: Pick<SlideDeck, 'slides'>
): Array<{ number: number; slide: Slide }> {
  return deck.slides
    .map((slide, i) => ({ number: i + 1, slide }))
    .filter(
      ({ slide }) => TEACHING.has(slide.layout) && !slide.image && !slide.wants
    )
    .slice(0, MAX_SLIDES);
}

/** What the editor is shown: the deck's title, then each slide it is asked about. */
export function pictureEditorPrompt(
  deck: Pick<SlideDeck, 'title' | 'unit' | 'slides'>,
  slides: Array<{ number: number; slide: Slide }>
): string {
  const lines = [
    `Deck: ${deck.title}${deck.unit ? ` (${deck.unit})` : ''}`,
    '',
  ];
  for (const { number, slide } of slides) {
    lines.push(`Slide ${number} (${slide.layout}): ${slide.title}`);
    const words = slideWords(slide);
    if (words) lines.push(words);
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** The editor's answer, read leniently: the first JSON object in it, checked. Anything else is nothing. */
export function readPictureEditorAnswer(
  text: string
): Array<{ slide: number; subject: string; shows?: string }> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const answer = Answer.safeParse(parsed);
  if (!answer.success) return [];
  return answer.data.slides.flatMap((entry) =>
    entry.subject && !/^(null|none|n\/a)$/i.test(entry.subject)
      ? [
          {
            slide: entry.slide,
            subject: entry.subject,
            ...(entry.shows ? { shows: entry.shows } : {}),
          },
        ]
      : []
  );
}

export type AskEditor = (system: string, prompt: string) => Promise<string>;

/**
 * The deck with a subject named for each teaching slide that had none, as
 * far as the editor could. Any failure leaves the deck as the planner wrote it.
 */
export async function withNamedSubjects<T extends SlideDeck>(
  deck: T,
  ask: AskEditor
): Promise<{ deck: T; named: number }> {
  const slides = slidesWithoutSubjects(deck);
  if (!slides.length) return { deck, named: 0 };
  let answer: string;
  try {
    answer = await ask(
      PICTURE_EDITOR_SYSTEM,
      pictureEditorPrompt(deck, slides)
    );
  } catch {
    return { deck, named: 0 };
  }
  const asked = new Set(slides.map(({ number }) => number));
  const named = new Map<number, { subject: string; shows?: string }>();
  for (const entry of readPictureEditorAnswer(answer))
    if (asked.has(entry.slide) && !named.has(entry.slide))
      named.set(entry.slide, entry);
  if (!named.size) return { deck, named: 0 };
  return {
    deck: {
      ...deck,
      slides: deck.slides.map((slide, i): Slide => {
        const want = named.get(i + 1);
        return want
          ? {
              ...slide,
              wants: {
                subject: want.subject,
                ...(want.shows ? { shows: want.shows } : {}),
              },
            }
          : slide;
      }),
    },
    named: named.size,
  };
}
