/**
 * A real slide deck, not a description of one.
 *
 * The planner emits decks as a fenced `yawp-slides` block of JSON alongside its
 * prose. Structure is what makes the difference: prose can only be read, but a
 * validated deck can be projected, paged through with a keyboard, printed one
 * slide to a page, and — later — exported to a file.
 *
 * Validation is strict on purpose. A slide that fails the schema is not a slide
 * a teacher should stand in front of, and the caller falls back to rendering
 * the reply as ordinary prose rather than showing a broken deck. The word and
 * bullet limits below are the difference between a slide and a paragraph on a
 * wall: the talking belongs in the speaker notes.
 */
import { z } from 'zod';

export const SLIDE_DECK_FENCE = 'yawp-slides';

export const SLIDE_LAYOUTS = [
  'title',
  'statement',
  'bullets',
  'compare',
  'prompt',
  'steps',
  'quote',
  'closing',
] as const;

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

/** Room-legibility limits. Anything longer belongs in the notes. */
const MAX_TITLE_CHARS = 90;
const MAX_LINE_CHARS = 160;
const MAX_BODY_CHARS = 320;
const MAX_BULLETS = 7;
const MAX_SLIDES = 40;

const line = z.string().trim().min(1).max(MAX_LINE_CHARS);
const column = z
  .object({ label: z.string().trim().min(1).max(40), text: line })
  .strict();

const slideSchema = z
  .object({
    layout: z.enum(SLIDE_LAYOUTS),
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    subtitle: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
    body: z.string().trim().min(1).max(MAX_BODY_CHARS).optional(),
    bullets: z.array(line).min(1).max(MAX_BULLETS).optional(),
    left: column.optional(),
    right: column.optional(),
    attribution: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
    // Required: the notes are where the lesson actually lives, and a slide
    // without them is a slide the teacher has to improvise around.
    speakerNotes: z.string().trim().min(1).max(2_000),
    minutes: z.number().int().min(0).max(60).optional(),
  })
  .strict()
  .superRefine((slide, context) => {
    const needsBullets = slide.layout === 'bullets' || slide.layout === 'steps';
    if (needsBullets && !slide.bullets?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bullets'],
        message: `A ${slide.layout} slide needs bullets.`,
      });
    }
    if (slide.layout === 'compare' && (!slide.left || !slide.right)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['left'],
        message: 'A compare slide needs both columns.',
      });
    }
    const needsBody =
      slide.layout === 'statement' ||
      slide.layout === 'prompt' ||
      slide.layout === 'quote';
    if (needsBody && !slide.body) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: `A ${slide.layout} slide needs a body.`,
      });
    }
  });

const deckSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    subtitle: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
    slides: z.array(slideSchema).min(1).max(MAX_SLIDES),
  })
  .strict();

export type Slide = z.infer<typeof slideSchema>;
export type SlideDeck = z.infer<typeof deckSchema>;

// Tolerates extra backticks and trailing spaces on the fence line, because the
// model writes this by hand.
const FENCE_PATTERN = new RegExp(
  '```+\\s*' + SLIDE_DECK_FENCE + '\\s*\\n([\\s\\S]*?)```+',
  'i'
);

export type ParsedSlideDeck = {
  deck: SlideDeck;
  /** The reply with the deck block removed, so raw JSON never reaches a teacher. */
  body: string;
};

/**
 * Pull a deck out of an assistant reply. Returns null when there is no deck, or
 * when what is there does not validate — the caller then renders the reply as
 * prose, which is honest rather than broken.
 */
export function parseSlideDeck(content: string): ParsedSlideDeck | null {
  const match = content.match(FENCE_PATTERN);
  if (!match?.[1]) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const parsed = deckSchema.safeParse(raw);
  if (!parsed.success) return null;

  return {
    deck: parsed.data,
    body: content
      .replace(match[0], '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  };
}

export function hasSlideDeck(content: string): boolean {
  return parseSlideDeck(content) !== null;
}

export function deckDurationMinutes(deck: SlideDeck): number {
  return deck.slides.reduce((total, slide) => total + (slide.minutes ?? 0), 0);
}

/** Everything actually on screen for a slide — notes deliberately excluded. */
export function slideSearchText(slide: Slide): string {
  return [
    slide.title,
    slide.subtitle,
    slide.body,
    slide.attribution,
    ...(slide.bullets ?? []),
    slide.left?.label,
    slide.left?.text,
    slide.right?.label,
    slide.right?.text,
  ]
    .filter(Boolean)
    .join(' ');
}
