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
    // Coerced: the model sometimes writes "5" rather than 5.
    minutes: z.coerce.number().int().min(0).max(60).optional(),
  })
  // Deliberately not .strict(): one stray key should not cost the teacher the
  // whole deck. Unknown fields are dropped, required ones still enforced.
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

const deckSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  subtitle: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
  slides: z.array(slideSchema).min(1).max(MAX_SLIDES),
});

export type Slide = z.infer<typeof slideSchema>;
export type SlideDeck = z.infer<typeof deckSchema>;

// Any fenced block, however it is tagged. The model is writing this by hand and
// reaches for ```json or a bare fence as often as the tag we asked for, so the
// deck is identified by its shape rather than by its label.
const ANY_FENCE = /```+[^\n]*\n([\s\S]*?)```+/g;

/**
 * Field names the model reaches for instead of the canonical ones. Aliasing
 * them is not sloppiness — it is the difference between a teacher getting the
 * deck they asked for and getting an apology.
 */
const FIELD_ALIASES: Record<string, string> = {
  prompt: 'body',
  text: 'body',
  content: 'body',
  notes: 'speakerNotes',
  speaker_notes: 'speakerNotes',
  presenterNotes: 'speakerNotes',
  items: 'bullets',
  points: 'bullets',
  time: 'minutes',
  duration: 'minutes',
};

// "1. Introduce the quote" — the steps layout numbers its own lines, so typed
// numbering would show up twice.
const TYPED_ENUMERATION = /^\s*(?:\d{1,2}[.)]|[-*•])\s+/;

function normalizeSlide(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const slide: Record<string, unknown> = {
    ...(raw as Record<string, unknown>),
  };

  for (const [alias, canonical] of Object.entries(FIELD_ALIASES)) {
    if (slide[alias] !== undefined && slide[canonical] === undefined) {
      slide[canonical] = slide[alias];
    }
    delete slide[alias];
  }

  if (Array.isArray(slide.bullets)) {
    slide.bullets = slide.bullets.map((bullet) =>
      typeof bullet === 'string'
        ? bullet.replace(TYPED_ENUMERATION, '')
        : bullet
    );
  }

  return slide;
}

function normalizeDeck(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const deck = raw as Record<string, unknown>;
  if (!Array.isArray(deck.slides)) return raw;
  return { ...deck, slides: deck.slides.map(normalizeSlide) };
}

/** A fenced block whose JSON is shaped like a deck, whatever its fence says. */
function findDeckBlock(
  content: string
): { block: string; raw: unknown } | null {
  for (const match of content.matchAll(ANY_FENCE)) {
    const inner = match[1];
    if (!inner?.includes('"slides"')) continue;
    try {
      const raw = JSON.parse(inner);
      if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as any).slides)
      ) {
        return { block: match[0], raw };
      }
    } catch {
      // A deck-shaped block we cannot parse still counts as an attempt, so the
      // caller can strip it rather than print it.
      if (/"slides"\s*:\s*\[/.test(inner))
        return { block: match[0], raw: null };
    }
  }
  return null;
}

function withoutBlock(content: string, block: string): string {
  return content
    .replace(block, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type ParsedSlideDeck = {
  deck: SlideDeck;
  /** The reply with the deck block removed, so raw JSON never reaches a teacher. */
  body: string;
};

/**
 * What a reply turned out to contain.
 *
 * `unreadable` matters as much as `deck`: a deck the schema rejected must still
 * have its JSON stripped, because the alternative is a wall of braces in front
 * of a teacher. The UI shows the prose and a quiet note instead.
 */
export type SlideDeckOutcome =
  | { kind: 'none' }
  | { kind: 'deck'; deck: SlideDeck; body: string }
  | { kind: 'unreadable'; body: string };

export function readSlideDeck(content: string): SlideDeckOutcome {
  const found = findDeckBlock(content);
  if (!found) return { kind: 'none' };

  const body = withoutBlock(content, found.block);
  if (found.raw === null) return { kind: 'unreadable', body };

  const parsed = deckSchema.safeParse(normalizeDeck(found.raw));
  if (!parsed.success) return { kind: 'unreadable', body };

  return { kind: 'deck', deck: parsed.data, body };
}

/** Convenience wrapper for callers that only care about a usable deck. */
export function parseSlideDeck(content: string): ParsedSlideDeck | null {
  const outcome = readSlideDeck(content);
  return outcome.kind === 'deck'
    ? { deck: outcome.deck, body: outcome.body }
    : null;
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
