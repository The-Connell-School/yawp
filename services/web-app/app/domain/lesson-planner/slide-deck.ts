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
import { resolveDeckArt } from './deck-art';

export const SLIDE_DECK_FENCE = 'yawp-slides';

/** The layouts every renderer has always drawn. */
export const CLASSIC_SLIDE_LAYOUTS = [
  'title',
  'statement',
  'bullets',
  'compare',
  'prompt',
  'steps',
  'quote',
  'closing',
  // The teacher's own picture, whole, beside its question (Nov 1). Drawn as
  // itself by every renderer, never mapped to another layout.
  'picture',
] as const;

/**
 * The gallery deck's templates (Yawp! Lesson Deck Kit, "The gallery and the
 * page"), added beside the classic ones. A classic renderer draws each as its
 * nearest classic layout (`classicSlide`), so a gallery deck still shows
 * wherever the gallery look is off.
 */
export const GALLERY_SLIDE_LAYOUTS = [
  'agenda',
  'discuss',
  'big_idea',
  'write',
  'notes',
  'divider',
  'read',
  'look',
  'excerpt',
  'exit',
] as const;

/**
 * Background for a text (Nov 19): events on a line, and places on a real
 * map. Drawn by the kit's v4 layout; every older look draws them as a list
 * (`legacyContextSlide`, `classicSlide`). Not gallery templates: the planner
 * is told of them only with `lesson_planner_context_tools`.
 */
export const CONTEXT_SLIDE_LAYOUTS = ['timeline', 'map', 'define', 'person'] as const;

/**
 * How a text is built (Nov 22): reviewers found a literature deck had almost
 * nothing to look at, and a diagram of how a text is organized helps a reader
 * more than a picture beside it does (Carney & Levin 2002). Drawn by the
 * kit's v4 layout from boxes and words; every older look draws it as a list
 * (`legacyContextSlide`, `classicSlide`).
 */
export const STRUCTURE_SLIDE_LAYOUTS = ['diagram'] as const;

/**
 * What a diagram draws: the `parts` of a text in a strip, each as wide as its
 * share (a sonnet's quatrains and couplet); `frames` one inside the other (a
 * story inside a story); a `cast` of cards (who is in it, and what each wants).
 */
export const DIAGRAM_KINDS = ['parts', 'frames', 'cast'] as const;
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];
/** The most a diagram holds; a longer one is cut to this, never a lost deck. */
export const MAX_DIAGRAM_ITEMS = 6;
/** The most phrases an excerpt slide marks in its passage. */
export const MAX_HIGHLIGHTS = 4;

export const SLIDE_LAYOUTS = [...CLASSIC_SLIDE_LAYOUTS, ...GALLERY_SLIDE_LAYOUTS, ...CONTEXT_SLIDE_LAYOUTS, ...STRUCTURE_SLIDE_LAYOUTS] as const;

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];
export type ClassicSlideLayout = (typeof CLASSIC_SLIDE_LAYOUTS)[number];

/** A unit's one accent color (Deck Kit: "one accent per unit"). */
export const DECK_ACCENTS = ['ember', 'indigo', 'olive', 'plum'] as const;
export type DeckAccent = (typeof DECK_ACCENTS)[number];

/** Room-legibility limits. Anything longer belongs in the notes. */
const MAX_TITLE_CHARS = 90;
const MAX_LINE_CHARS = 200;
const MAX_BODY_CHARS = 320;
/** A passage students annotate: eight lines of verse or a short paragraph. */
const MAX_EXCERPT_CHARS = 700;
/** The most a slide's page note holds ("pp. 1–3", "1.3.130–142"). */
const MAX_PAGE_CHARS = 20;

/**
 * Agenda lines, no more than an agenda slide holds: past that, the two
 * neighbouring lines with the fewest minutes between them share a line, so
 * every part is still there and the minutes still add up (re-test, Nov 22: a
 * seven-line agenda, the planner's own or built from the plan, lost the deck).
 */
export function fitAgenda<T extends { title: string; minutes?: number }>(items: T[]): T[] {
  let lines = [...items];
  const at = (i: number) => lines[i]!.minutes ?? 0;
  while (lines.length > MAX_AGENDA_ITEMS) {
    let best = 0;
    for (let i = 1; i < lines.length - 1; i += 1) if (at(i) + at(i + 1) < at(best) + at(best + 1)) best = i;
    const [a, b] = [lines[best]!, lines[best + 1]!];
    const joined = `${a.title}, ${b.title.charAt(0).toLowerCase()}${b.title.slice(1)}`;
    const minutes = a.minutes == null && b.minutes == null ? undefined : at(best) + at(best + 1);
    lines = [...lines.slice(0, best), { ...a, title: joined.length <= 70 ? joined : a.title, ...(minutes == null ? {} : { minutes }) }, ...lines.slice(best + 2)];
  }
  return lines;
}

/** A long page note in the short forms a teacher writes. */
export function shortPage(page: string): string {
  let short = page
    .trim()
    .replace(/\bact\s+([ivx\d]+)\s*,?\s*scene\s+([ivx\d]+)\s*,?\s*(?:lines?|ll?\.)\s*/i, '$1.$2.')
    .replace(/\bact\s+([ivx\d]+)\s*,?\s*scene\s+([ivx\d]+)/i, '$1.$2')
    .replace(/\bbook\s+([ivx\d]+)\s*,?\s*(?:lines?|ll?\.)\s*/i, '$1.')
    .replace(/\bchapter\s+/gi, 'ch. ')
    .replace(/\bpages?\s+/gi, (m) => (/s\s/i.test(m) ? 'pp. ' : 'p. '))
    .replace(/\blines\s+/gi, 'll. ')
    .replace(/\bline\s+/gi, 'l. ')
    .replace(/\bstanzas?\s+/gi, 'st. ')
    .replace(/\s+/g, ' ');
  if (short.length > MAX_PAGE_CHARS) short = short.slice(0, MAX_PAGE_CHARS).replace(/[\s,;–-]+\S*$/, '').trim();
  return short || page.trim().slice(0, MAX_PAGE_CHARS);
}

/** The most parts an agenda slide lists. */
export const MAX_AGENDA_ITEMS = 6;
// Wider than a bullet on purpose: "here is a weak conclusion next to a strong
// one" is two paragraphs, and that is a slide worth projecting.
const MAX_COLUMN_CHARS = 320;
const MAX_BULLETS = 7;
const MAX_SLIDES = 40;

const line = z.string().trim().min(1).max(MAX_LINE_CHARS);
/** A stored picture's id: a cuid, letters and digits only. */
const PICTURE_ID = /^[a-z0-9]{8,40}$/i;
// Not .strict(): a stray key in one column should not cost the whole deck.
const column = z.object({
  label: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1).max(MAX_COLUMN_CHARS),
});

/**
 * The picture a slide or an event wants (Kevin, Nov 22: dual coding): the
 * subject by its own name, as an encyclopedia titles it, and what the picture
 * should show. Yawp! finds it and sets `image`; the planner never writes an
 * address.
 */
const pictureWant = z.object({
  subject: z.string().trim().min(1).max(120),
  shows: z.string().trim().min(1).max(160).optional(),
});

const slideSchema = z
  .object({
    layout: z.enum(SLIDE_LAYOUTS),
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    subtitle: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
    // An excerpt carries a stanza or a paragraph as printed (Nov 22); every
    // other slide keeps to MAX_BODY_CHARS, checked below.
    body: z.string().trim().min(1).max(MAX_EXCERPT_CHARS).optional(),
    bullets: z.array(line).min(1).max(MAX_BULLETS).optional(),
    left: column.optional(),
    right: column.optional(),
    attribution: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
    // Required: the notes are where the lesson actually lives, and a slide
    // without them is a slide the teacher has to improvise around.
    speakerNotes: z.string().trim().min(1).max(2_000),
    // Coerced: the model sometimes writes "5" rather than 5.
    minutes: z.coerce.number().int().min(0).max(60).optional(),
    // The gallery templates' own slots (Deck Kit, "the twelve templates").
    // All optional, so a classic slide never needs them.
    mode: z.string().trim().min(1).max(24).optional(),
    agenda: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(70),
          minutes: z.coerce.number().int().min(0).max(120).optional(),
        })
      )
      .min(1)
      .max(MAX_AGENDA_ITEMS)
      .optional(),
    question: z.string().trim().min(1).max(MAX_BODY_CHARS).optional(),
    stem: z.string().trim().min(1).max(160).optional(),
    grouping: z.string().trim().min(1).max(40).optional(),
    accentWord: z.string().trim().min(1).max(40).optional(),
    followUp: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
    routine: z.string().trim().min(1).max(60).optional(),
    timeline: z
      .array(
        z.object({
          year: z.string().trim().min(1).max(14),
          caption: z.string().trim().min(1).max(70),
          mark: z.enum(['accent', 'ink', 'open']).optional(),
        })
      )
      .min(1)
      .max(5)
      .optional(),
    facts: z.array(line).min(1).max(3).optional(),
    tasks: z
      .array(z.object({ verb: z.string().trim().min(1).max(24), text: z.string().trim().min(1).max(160) }))
      .min(1)
      .max(4)
      .optional(),
    seconds: z.coerce.number().int().min(5).max(600).optional(),
    author: z.string().trim().min(1).max(80).optional(),
    work: z.string().trim().min(1).max(120).optional(),
    page: z.string().trim().min(1).max(MAX_PAGE_CHARS).optional(),
    part: z.string().trim().min(1).max(12).optional(),
    nextLesson: z.string().trim().min(1).max(MAX_TITLE_CHARS).optional(),
    // Deck spec v3: the divider that starts a stage names its writing-process
    // step (Step 1. pre-writing … Step 6. title and format).
    processStep: z.coerce.number().int().min(1).max(6).optional(),
    // A quiz question's choices; the correct one (1-based) gets a soft band.
    choices: z.array(line).min(2).max(5).optional(),
    answer: z.coerce.number().int().min(1).max(5).optional(),
    // The exit slide's Yawp! button ("Open Yawp! → Exit ticket").
    button: z.string().trim().min(1).max(40).optional(),
    // The title slide's course line ("English 9"); in deck spec v4.1, the
    // class and date ("English 10, November 12").
    course: z.string().trim().min(1).max(80).optional(),
    // Deck spec v4.1: the teacher's name on the title slide, when the planner
    // has it from the session. Left out, the line is left out.
    teacher: z.string().trim().min(1).max(80).optional(),
    // Which of the deck's colors (1-based) this slide uses, for a section
    // that keeps its own color.
    color: z.coerce.number().int().min(1).max(3).optional(),
    // Which stack step this slide belongs to, by its number in the stack
    // (Brian's run 3): Run the show moves the projector with the teacher.
    step: z.coerce.number().int().min(1).max(MAX_SLIDES).optional(),
    // A picture from the teacher's own deck, by its id (Nov 1). Only an id:
    // it goes into a URL, so anything else is dropped before validation.
    image: z.string().regex(PICTURE_ID).optional(),
    // The picture this slide wants beside its words (Nov 22).
    wants: pictureWant.optional(),
    // A timeline slide's events (Nov 19), in order. With two rows, `track`
    // says which row an event sits in and `tracks` names the rows.
    events: z
      .array(
        z.object({
          date: z.string().trim().min(1).max(24),
          title: z.string().trim().min(1).max(60),
          detail: z.string().trim().min(1).max(220).optional(),
          track: z.coerce.number().int().min(1).max(2).optional(),
          // This event's own picture, shown when it is in focus (Nov 22).
          wants: pictureWant.optional(),
          image: z.string().regex(PICTURE_ID).optional(),
        })
      )
      .min(2)
      .max(8)
      .optional(),
    tracks: z.array(z.string().trim().min(1).max(30)).length(2).optional(),
    // A map slide's places (Nov 19). The planner names a place; Yawp! finds
    // it in its own place list and writes `lat`, `lon` and `found` (what it
    // matched). A position the planner writes is thrown away
    // (resolveDeckPlaces), so a pin is never where a model guessed.
    places: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          where: z.string().trim().min(1).max(60).optional(),
          label: z.string().trim().min(1).max(40).optional(),
          note: z.string().trim().min(1).max(200).optional(),
          lat: z.number().min(-90).max(90).optional(),
          lon: z.number().min(-180).max(180).optional(),
          found: z.string().trim().min(1).max(120).optional(),
        })
      )
      .min(1)
      .max(8)
      .optional(),
    // Join the places in order: a journey.
    route: z.boolean().optional(),
    // Countries shaded in the deck color, by today's names, and what the
    // slide calls them together ("Anglo-Egyptian Sudan").
    shade: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
    shadeLabel: z.string().trim().min(1).max(60).optional(),
    // Show the places among their neighbours: the first, wider map of a
    // text's background (Kevin, Nov 21).
    wide: z.boolean().optional(),
    // The area the map shows, written by Yawp! with the places' positions.
    view: z.object({ w: z.number(), s: z.number(), e: z.number(), n: z.number() }).optional(),
    // A define slide's words (Kevin, Nov 21): the word, what it means in
    // plain words, and an example from the book's world.
    terms: z
      .array(
        z.object({
          word: z.string().trim().min(1).max(40),
          definition: z.string().trim().min(1).max(200),
          example: z.string().trim().min(1).max(200).optional(),
        })
      )
      .min(1)
      .max(3)
      .optional(),
    // A person slide's people (Kevin, Nov 21): real people and a novel's
    // characters, each with who they are, and the teacher's picture by id.
    people: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          role: z.string().trim().min(1).max(80),
          note: z.string().trim().min(1).max(200).optional(),
          image: z.string().regex(PICTURE_ID).optional(),
          // Their picture, by the name of their own article (Nov 22).
          wants: pictureWant.optional(),
        })
      )
      .min(1)
      .max(4)
      .optional(),
    // A diagram slide (Nov 22): how the text is built, in boxes and words.
    // `weight` is a part's share of the strip (a quatrain 4, the couplet 2);
    // `note` is the small grey line (a part's lines, who a person is to another).
    diagram: z
      .object({
        kind: z.enum(DIAGRAM_KINDS),
        items: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(40),
              text: z.string().trim().min(1).max(120).optional(),
              note: z.string().trim().min(1).max(60).optional(),
              weight: z.coerce.number().min(1).max(40).optional(),
            })
          )
          .min(2)
          .max(MAX_DIAGRAM_ITEMS),
      })
      .optional(),
    // An excerpt slide's phrases to look at (Nov 22; Mayer's signaling
    // principle: mark the words the task is about), copied from the passage,
    // in the order of the tasks. Drawn in the color of its task.
    highlight: z.array(z.string().trim().min(2).max(80)).min(1).max(MAX_HIGHLIGHTS).optional(),
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
    const needs = (field: keyof typeof slide, what: string, ok: boolean) => {
      if (!ok) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [field as string], message: `A ${slide.layout} slide needs ${what}.` });
      }
    };
    if (slide.layout === 'agenda') needs('agenda', 'agenda items', Boolean(slide.agenda?.length));
    if (slide.layout === 'discuss' || slide.layout === 'look') {
      needs('question', 'a question', Boolean(slide.question || slide.body));
    }
    if (['big_idea', 'write', 'excerpt', 'exit'].includes(slide.layout)) {
      needs('body', 'a body', Boolean(slide.body));
    }
    if (slide.layout === 'notes') {
      needs('timeline', 'a timeline or facts', Boolean(slide.timeline?.length || slide.facts?.length));
    }
    if (slide.layout === 'read') {
      needs('tasks', 'tasks', Boolean(slide.tasks?.length || slide.bullets?.length));
    }
    if (slide.layout === 'timeline') needs('events', 'at least two events', Boolean(slide.events?.length));
    if (slide.layout === 'map') needs('places', 'at least one place', Boolean(slide.places?.length));
    if (slide.layout === 'define') needs('terms', 'at least one word', Boolean(slide.terms?.length));
    if (slide.layout === 'person') needs('people', 'at least one person', Boolean(slide.people?.length));
    if (slide.layout === 'diagram') needs('diagram', 'a diagram: `kind` and two to six `items`', Boolean(slide.diagram));
    if (slide.layout === 'picture') needs('image', 'the id of one of the teacher’s pictures, or `wants`', Boolean(slide.image || slide.wants));
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
    if (slide.body && slide.layout !== 'excerpt' && slide.body.length > MAX_BODY_CHARS) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_BODY_CHARS,
        type: 'string',
        inclusive: true,
        path: ['body'],
        message: `String must contain at most ${MAX_BODY_CHARS} character(s)`,
      });
    }
  });

const deckSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  subtitle: z.string().trim().min(1).max(MAX_LINE_CHARS).optional(),
  // The gallery deck (Deck Kit): the unit it belongs to (for the running
  // head), its accent, and the painting from the art library it hangs.
  unit: z.string().trim().min(1).max(80).optional(),
  accent: z.enum(DECK_ACCENTS).optional(),
  // Deck spec v3: two or three colors from the painting; the first is the
  // primary. Without them, the painting's own colors are used.
  colors: z.array(z.string().trim().regex(/^#?[0-9a-fA-F]{6}$/)).min(1).max(3).optional(),
  art: z.string().trim().min(1).max(60).optional(),
  slides: z.array(slideSchema).min(1).max(MAX_SLIDES),
});

export type Slide = z.infer<typeof slideSchema> & {
  /**
   * Render-only: the event or place in focus on a stepped slide (a timeline,
   * a map), set where the slide is drawn (Present, the studio). Never in the
   * schema, so the planner cannot set it and a saved deck never stores it.
   */
  focus?: number;
};
/** The look a gallery deck is drawn in: absent for spec v3, `v4` for spec v4, `v4.1` for spec v4.1. */
export type DeckKit = 'v4' | 'v4.1';
export type SlideDeck = Omit<z.infer<typeof deckSchema>, 'slides'> & {
  slides: Slide[];
  /**
   * Render-only: set where the deck is loaded for drawing, from the school's
   * `lesson_planner_deck_kit_v4` and `lesson_planner_deck_kit_v41` flags
   * (`withDeckKit`). Never in the schema, so
   * the planner cannot set it and a saved deck never stores it.
   */
  kit?: DeckKit;
};

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
  // A quiz question's choices and its answer (bot test, Nov 19).
  options: 'choices',
  correct: 'answer',
  correctAnswer: 'answer',
  correct_answer: 'answer',
  highlights: 'highlight',
  highlighted: 'highlight',
  picture: 'image',
  pictureId: 'image',
  imageId: 'image',
  photo: 'image',
};

/** The same forgiveness, one level down, for a compare slide's two columns. */
const COLUMN_ALIASES: Record<string, string> = {
  heading: 'label',
  name: 'label',
  title: 'label',
  body: 'text',
  content: 'text',
  value: 'text',
};

/**
 * Names a model reaches for when it means one of ours. A slide labelled
 * "question" is a prompt slide; refusing it costs the teacher the whole deck
 * over a synonym.
 */
const LAYOUT_ALIASES: Record<string, SlideLayout> = {
  vocabulary: 'define',
  vocab: 'define',
  words: 'define',
  glossary: 'define',
  definitions: 'define',
  definition: 'define',
  key_terms: 'define',
  'key-terms': 'define',
  people: 'person',
  cast: 'person',
  characters: 'person',
  who: 'person',
  'whos-who': 'person',
  portrait: 'person',
  bullet: 'bullets',
  list: 'bullets',
  points: 'bullets',
  takeaways: 'bullets',
  comparison: 'compare',
  contrast: 'compare',
  versus: 'compare',
  'side-by-side': 'compare',
  question: 'prompt',
  writing: 'prompt',
  'writing-prompt': 'prompt',
  warmup: 'prompt',
  'warm-up': 'prompt',
  step: 'steps',
  instructions: 'steps',
  directions: 'steps',
  process: 'steps',
  claim: 'statement',
  'big-idea': 'statement',
  objective: 'statement',
  passage: 'quote',
  photo: 'picture',
  photograph: 'picture',
  image: 'picture',
  cover: 'title',
  opening: 'title',
  section: 'title',
  bigidea: 'big_idea',
  'read-along': 'read',
  read_along: 'read',
  timeline: 'notes',
  closing_slide: 'closing',
  'exit-ticket': 'closing',
  exit_ticket: 'closing',
  'exit ticket': 'closing',
  // A quiz question is a discuss slide with choices; there is no quiz layout,
  // but the kit's instructions list "quiz" beside the layouts and a model
  // takes it for one (bot test, Nov 19: three decks of three).
  quiz: 'discuss',
  'multiple-choice': 'discuss',
  multiple_choice: 'discuss',
  'multiple choice': 'discuss',
  mcq: 'discuss',
  conclusion: 'closing',
  wrapup: 'closing',
  'wrap-up': 'closing',
};

const LAYOUT_SET = new Set<string>(SLIDE_LAYOUTS);

// "1. Introduce the quote" — the steps layout numbers its own lines, so typed
// numbering would show up twice.
const TYPED_ENUMERATION = /^\s*(?:\d{1,2}[.)]|[-*•])\s+/;

/**
 * "5-7", "3 min", "about 10 minutes" — a planner that time-boxes every activity
 * writes its slide timings the same way. Coercion turns those into NaN, so pull
 * the first whole number out and drop the field when there isn't one, rather
 * than failing a slide over a label.
 */
function normalizeMinutes(raw: unknown): unknown {
  if (typeof raw === 'number' || raw === undefined || raw === null) return raw;
  if (typeof raw !== 'string') return raw;
  const first = raw.match(/\d+/);
  return first ? Number(first[0]) : undefined;
}

/** A bullet the model wrote as `{ text: … }`, or a whole list as one string. */
function normalizeBullets(raw: unknown): unknown {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split('\n')
      : null;
  if (!items) return raw;

  const flattened = items.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      for (const key of ['text', 'label', 'title', 'content', 'point']) {
        if (typeof record[key] === 'string') return record[key];
      }
    }
    return item;
  });

  return flattened
    .map((item) =>
      typeof item === 'string'
        ? item.replace(TYPED_ENUMERATION, '').trim()
        : item
    )
    .filter((item) => typeof item !== 'string' || item.length > 0);
}

// "A) Fragile", "b. Decay", "(C) Nature", "D: Recovered": a quiz slide letters its own choices.
const TYPED_LETTER = /^\s*\(?[A-Ea-e][.):]\)?\s+/;

/** A quiz question's choices, without letters typed in front of them. */
function normalizeChoices(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((item) => (typeof item === 'string' ? item.replace(TYPED_LETTER, '').trim() : item)).filter((item) => typeof item !== 'string' || item.length > 0);
}

/**
 * The right choice's number, from 1, however it was written: a number, a
 * letter ("B"), or the choice's own words. One that names no choice is left
 * off rather than costing the deck: the question is still a question.
 */
function normalizeAnswer(raw: unknown, choices: unknown): unknown {
  const count = Array.isArray(choices) ? choices.length : 0;
  const within = (n: number) => (Number.isInteger(n) && n >= 1 && n <= count ? n : undefined);
  if (typeof raw === 'number') return within(raw);
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (/^\d+$/.test(text)) return within(Number(text));
  const letter = /^\(?([A-Ea-e])[.):]?\)?$/.exec(text);
  if (letter) return within(letter[1]!.toLowerCase().charCodeAt(0) - 96);
  const key = text.replace(TYPED_LETTER, '').trim().toLowerCase();
  const at = Array.isArray(choices) ? choices.findIndex((choice) => typeof choice === 'string' && choice.trim().toLowerCase() === key) : -1;
  return at >= 0 ? at + 1 : undefined;
}

const QUIZ_NAMES = new Set(['quiz', 'multiple-choice', 'multiple_choice', 'multiple choice', 'mcq']);

/** The layout the slide is, whatever the model called it — or none. */
function normalizeLayout(slide: Record<string, unknown>): unknown {
  const raw = slide.layout;
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase();
    // "timeline" was a model's word for a notes slide long before it was a
    // layout of its own (Nov 19): without events, it still is one.
    if (key === 'timeline' && !Array.isArray(slide.events)) return 'notes';
    if (LAYOUT_SET.has(key)) return key;
    // An unrecognised name is left alone so the schema rejects it by name,
    // rather than being silently turned into some other kind of slide.
    return LAYOUT_ALIASES[key] ?? raw;
  }
  // No layout at all: read it off the slide's own contents.
  if (Array.isArray(slide.bullets) && slide.bullets.length) return 'bullets';
  if (slide.left && slide.right) return 'compare';
  if (slide.body !== undefined) return 'statement';
  return 'title';
}

function applyAliases(
  raw: Record<string, unknown>,
  aliases: Record<string, string>
): Record<string, unknown> {
  const out = { ...raw };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (out[alias] !== undefined && out[canonical] === undefined) {
      out[canonical] = out[alias];
    }
    delete out[alias];
  }
  return out;
}

function normalizeColumn(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return applyAliases(raw as Record<string, unknown>, COLUMN_ALIASES);
}

/** "…: open it in Yawp! before you go." and its dashes, at the end of a button. */
const OPEN_IN_YAWP_TAIL = /\s*[:—–-]?\s*open it in Yawp!?(\s+before you go)?\.?\s*$/i;
/** "Next time:" and "Tomorrow:", however many, at the start of the next lesson. */
const NEXT_TIME_LEAD = /^\s*(?:(?:next time|tomorrow|next class|next lesson)\s*[:—–-]\s*)+/i;

/**
 * The heading a slide's layout gives it when the planner wrote none. On these
 * slides the title is a label or is hardly shown (a big idea draws its
 * statement); a deck is not lost for leaving it out. The preview lost a
 * Grapes of Wrath deck twice over an agenda and an exit, and then over two
 * big ideas and a look slide (Nov 22). A title slide and a divider still
 * need theirs: there the title is the slide.
 */
const OWN_TITLES: Record<string, string> = {
  agenda: 'Today',
  exit: 'Before you go',
  discuss: 'Talk',
  write: 'Write',
  read: 'Read',
  look: 'Look',
  big_idea: 'Big idea',
  notes: 'Notes',
  excerpt: 'From the text',
  timeline: 'Timeline',
  map: 'Map',
  define: 'Words',
  person: 'People',
};

const clipTo = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** A diagram's kind, by the names a model reaches for. */
const DIAGRAM_KIND_ALIASES: Record<string, DiagramKind> = {
  parts: 'parts',
  part: 'parts',
  strip: 'parts',
  sections: 'parts',
  structure: 'parts',
  movements: 'parts',
  frames: 'frames',
  frame: 'frames',
  nested: 'frames',
  'frame narrative': 'frames',
  'frame-narrative': 'frames',
  frame_narrative: 'frames',
  cast: 'cast',
  characters: 'cast',
  cards: 'cast',
  people: 'cast',
  family: 'cast',
  who: 'cast',
};

/** The same forgiveness, one level down, for one part, frame or person of a diagram. */
const DIAGRAM_ITEM_ALIASES: Record<string, string> = {
  name: 'label',
  title: 'label',
  heading: 'label',
  part: 'label',
  character: 'label',
  body: 'text',
  description: 'text',
  detail: 'text',
  summary: 'text',
  content: 'text',
  wants: 'text',
  relation: 'note',
  role: 'note',
  caption: 'note',
  size: 'weight',
  share: 'weight',
  span: 'weight',
};

const DIAGRAM_TITLES: Record<DiagramKind, string> = { parts: 'The parts', frames: 'A story inside a story', cast: 'Who is in it' };

type DiagramItem = { label: string; text?: string; note?: string; weight?: number };

/** One part of a diagram, however it was written; null when it has no name to draw. */
function normalizeDiagramItem(raw: unknown): DiagramItem | null {
  let item: Record<string, unknown>;
  if (typeof raw === 'string') {
    // "Couplet: the turn" is a label and its text.
    const line = raw.replace(TYPED_ENUMERATION, '').trim();
    const cut = /^(.{1,40}?)\s*(?::\s+|\s[–—-]\s+)(.+)$/.exec(line);
    item = cut ? { label: cut[1], text: cut[2] } : { label: line };
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    item = applyAliases(raw as Record<string, unknown>, DIAGRAM_ITEM_ALIASES);
    // "lines": 4 is how much of the poem the part is; "lines": "1–4" is which.
    const lines = (raw as Record<string, unknown>).lines;
    if (typeof lines === 'number' && item.weight === undefined) item.weight = lines;
    if (typeof lines === 'string' && lines.trim() && item.note === undefined) item.note = /^\d/.test(lines.trim()) ? `lines ${lines.trim()}` : lines;
  } else {
    return null;
  }
  // Words too long for their box are cut, never the reason a deck is lost.
  const words = (value: unknown, max: number) => {
    const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    return text ? clipTo(text, max) : undefined;
  };
  const label = words(item.label, 40);
  if (!label) return null;
  const text = words(item.text, 120);
  const note = words(item.note, 60);
  // "4", 4 and "4 lines" are all four.
  const number = typeof item.weight === 'number' ? item.weight : typeof item.weight === 'string' ? Number(/\d+(?:\.\d+)?/.exec(item.weight)?.[0]) : NaN;
  const weight = Number.isFinite(number) && number > 0 ? number : undefined;
  return { label, ...(text ? { text } : {}), ...(note ? { note } : {}), ...(weight ? { weight } : {}) };
}

/** Shares written as percentages (50, 25, 25) or fractions (0.5, 0.25, 0.25), kept in proportion within 1 to 40. */
function fitWeights(items: DiagramItem[]): DiagramItem[] {
  const given = items.flatMap((item) => (item.weight ? [item.weight] : []));
  if (!given.length) return items;
  const [least, most] = [Math.min(...given), Math.max(...given)];
  const scale = most > 40 ? 40 / most : least < 1 ? 1 / least : 1;
  return items.map((item) => (item.weight ? { ...item, weight: Math.min(40, Math.max(1, Math.round(item.weight * scale * 100) / 100)) } : item));
}

/**
 * A diagram, however the planner wrote it (Nov 22): whole (`diagram: { kind,
 * items }`), as a bare list, with its items under their kind's name
 * (`"parts": [...]`), or flat on the slide. Read from the slide as written,
 * before `items` is taken for bullets. `diagram` is null when there are not
 * two things to draw; `lines` are its items as a list, for the slide that
 * takes its place.
 */
function readDiagram(raw: Record<string, unknown>): { asked: boolean; diagram: { kind: DiagramKind; items: DiagramItem[] } | null; lines: string[]; used: string[] } | null {
  const kindOf = (value: unknown) => (typeof value === 'string' ? DIAGRAM_KIND_ALIASES[value.trim().toLowerCase()] : undefined);
  const layout = typeof raw.layout === 'string' ? raw.layout.trim().toLowerCase() : '';
  const given = raw.diagram;
  const inner = given && typeof given === 'object' && !Array.isArray(given) ? (given as Record<string, unknown>) : {};
  // "cast" and "people" were names for a person slide first: with `people`, they still are.
  const named = layout !== 'diagram' && !Array.isArray(raw.people) ? kindOf(layout) : undefined;
  const asked = layout === 'diagram' || given !== undefined;
  if (!asked && !named) return null;

  let kind = kindOf(inner.kind) ?? kindOf(inner.type) ?? kindOf(raw.kind) ?? named;
  let list: unknown[] | undefined = Array.isArray(given) ? given : Array.isArray(inner.items) ? inner.items : undefined;
  const used = ['diagram', 'kind'];
  for (const holder of [inner, raw]) {
    for (const name of DIAGRAM_KINDS) {
      if (list || !Array.isArray(holder[name])) continue;
      list = holder[name] as unknown[];
      kind ??= name;
      if (holder === raw) used.push(name);
    }
  }
  if (!list && Array.isArray(raw.items)) {
    list = raw.items;
    used.push('items');
  }
  // A slide only called "cast", with nothing of a diagram in it, is left as it was.
  if (!list && !asked) return null;

  const items = fitWeights((list ?? []).flatMap((item) => normalizeDiagramItem(item) ?? []));
  const lines = items.slice(0, MAX_BULLETS).map((item) => clipTo(item.text ? `${item.label}: ${item.text}` : item.label, MAX_LINE_CHARS));
  if (items.length < 2) return { asked: true, diagram: null, lines, used };
  // No kind, or one Yawp! does not draw: parts when they have sizes, else cards, which suit anything.
  kind ??= items.some((item) => item.weight) ? 'parts' : 'cast';
  return { asked: true, diagram: { kind, items: items.slice(0, MAX_DIAGRAM_ITEMS) }, lines, used };
}

function normalizeSlide(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const read = readDiagram(raw as Record<string, unknown>);
  const written = { ...(raw as Record<string, unknown>) };
  if (read) for (const key of read.used) delete written[key];
  const slide = applyAliases(written, FIELD_ALIASES);
  if (read?.diagram) {
    slide.diagram = read.diagram;
    // A diagram carried on another kind of slide stays there; named or alone, it is the slide.
    const layout = typeof slide.layout === 'string' ? slide.layout.trim().toLowerCase() : '';
    if (!LAYOUT_SET.has(layout) || DIAGRAM_KIND_ALIASES[layout]) slide.layout = 'diagram';
    if (slide.layout === 'diagram' && (typeof slide.title !== 'string' || !slide.title.trim())) slide.title = DIAGRAM_TITLES[read.diagram.kind];
  } else if (read) {
    // A deck is never lost over a diagram: one that cannot be drawn is its
    // items in a list, and with no items the slide is read by what it holds.
    const layout = typeof slide.layout === 'string' ? slide.layout.trim().toLowerCase() : '';
    if (layout === 'diagram' || DIAGRAM_KIND_ALIASES[layout] || !LAYOUT_SET.has(layout)) {
      if (read.lines.length) {
        slide.layout = 'bullets';
        slide.bullets = read.lines;
        if (typeof slide.title !== 'string' || !slide.title.trim()) slide.title = 'How it is built';
      } else {
        delete slide.layout;
      }
    }
  }

  if (slide.left !== undefined) slide.left = normalizeColumn(slide.left);
  if (slide.right !== undefined) slide.right = normalizeColumn(slide.right);
  if (slide.bullets !== undefined) {
    slide.bullets = normalizeBullets(slide.bullets);
  }
  if (Array.isArray(slide.speakerNotes)) {
    slide.speakerNotes = slide.speakerNotes.filter(Boolean).join('\n');
  }
  if (slide.minutes !== undefined) {
    slide.minutes = normalizeMinutes(slide.minutes);
  }
  // Called a quiz, with its question only in the title: a discuss slide needs it as its question.
  const calledQuiz = typeof slide.layout === 'string' && QUIZ_NAMES.has(slide.layout.trim().toLowerCase());
  slide.layout = normalizeLayout(slide);
  if (calledQuiz && slide.question === undefined && slide.body === undefined && typeof slide.title === 'string') slide.question = slide.title;
  // An agenda and an exit have the layout's own heading; a deck is not lost
  // for leaving it out (preview, Nov 22: a Grapes of Wrath deck failed twice
  // over the two missing titles).
  // Where the passage is, as short as a slide's chip holds: "Act 1, Scene 3,
  // lines 130–142" is 1.3.130–142 (re-test, Nov 22: three long page notes
  // lost a Macbeth deck).
  if (typeof slide.page === 'string' && slide.page.trim().length > MAX_PAGE_CHARS) slide.page = shortPage(slide.page);
  if (typeof slide.part === 'number') slide.part = String(slide.part);
  if (Array.isArray(slide.agenda) && slide.agenda.length > MAX_AGENDA_ITEMS && slide.agenda.every((item) => item && typeof item === 'object' && typeof (item as { title?: unknown }).title === 'string')) {
    slide.agenda = fitAgenda(
      (slide.agenda as Array<{ title: string; minutes?: unknown }>).map((item) => ({ ...item, minutes: typeof item.minutes === 'number' ? item.minutes : Number(item.minutes) || undefined }))
    );
  }
  // An excerpt slide without its passage still says where the passage is
  // (work, lines or page) and what to do with it: it is a reading slide, not a
  // lost deck (re-test, Nov 22: "Dulce et Decorum Est" lost its deck over two).
  if (slide.layout === 'excerpt' && (typeof slide.body !== 'string' || !slide.body.trim()) && (slide.page || slide.work)) {
    slide.layout = 'read';
    delete slide.body;
  }
  const ownTitle = OWN_TITLES[slide.layout as string];
  if (ownTitle && (typeof slide.title !== 'string' || !slide.title.trim())) slide.title = ownTitle;
  if (slide.choices !== undefined) slide.choices = normalizeChoices(slide.choices);
  if (slide.answer !== undefined) {
    slide.answer = normalizeAnswer(slide.answer, slide.choices);
    if (slide.answer === undefined) delete slide.answer;
  }
  // A want written as a bare subject is a want; an event's picture is an id or none.
  const asWant = (raw: unknown) => (typeof raw === 'string' && raw.trim() ? { subject: raw.trim() } : raw);
  if (slide.wants !== undefined) slide.wants = asWant(slide.wants);
  if (Array.isArray(slide.events)) {
    slide.events = slide.events.map((event) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) return event;
      const { image, wants, ...rest } = event as Record<string, unknown>;
      return {
        ...rest,
        ...(wants !== undefined ? { wants: asWant(wants) } : {}),
        ...(typeof image === 'string' && PICTURE_ID.test(image.trim()) ? { image: image.trim() } : {}),
      };
    });
  }
  // A person's picture is one of the teacher's, by id, or none.
  if (Array.isArray(slide.people)) {
    slide.people = slide.people.map((person) => {
      if (!person || typeof person !== 'object' || Array.isArray(person)) return person;
      const { image, wants, ...rest } = person as Record<string, unknown>;
      const withWant = wants !== undefined ? { ...rest, wants: asWant(wants) } : rest;
      return typeof image === 'string' && PICTURE_ID.test(image.trim()) ? { ...withWant, image: image.trim() } : withWant;
    });
  }
  // The exit slide sets "<button>: open it in Yawp!" and "Next time: <next>"
  // itself, so a model that wrote either out in full put it on screen twice
  // ("Exit ticket: open it in Yawp!: open it in Yawp!", the Leopard deck, Nov 21).
  if (typeof slide.button === 'string') {
    const button = slide.button.replace(OPEN_IN_YAWP_TAIL, '').trim();
    if (button) slide.button = button;
  }
  if (typeof slide.nextLesson === 'string') {
    const next = slide.nextLesson.replace(NEXT_TIME_LEAD, '').trim();
    if (next) slide.nextLesson = next;
  }
  if (slide.image !== undefined && !(typeof slide.image === 'string' && PICTURE_ID.test(slide.image.trim()))) {
    delete slide.image;
  } else if (typeof slide.image === 'string') {
    slide.image = slide.image.trim();
  }
  // The phrases to mark in a passage: one written alone is a list of one, and
  // an empty or overlong one is dropped or cut, never the reason a deck is lost.
  if (slide.highlight !== undefined) {
    const phrases = (Array.isArray(slide.highlight) ? slide.highlight : [slide.highlight])
      .map((item) => {
        const record = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
        return record ? record.phrase ?? record.text : item;
      })
      .flatMap((item) => (typeof item === 'string' ? [item.replace(/\s+/g, ' ').trim()] : []))
      // Cut at a word, with no ellipsis: what is left is still in the passage.
      .map((phrase) => (phrase.length > 80 ? phrase.slice(0, 81).replace(/\s+\S*$/, '').slice(0, 80).trim() : phrase))
      .filter((phrase) => phrase.length >= 2)
      .slice(0, MAX_HIGHLIGHTS);
    if (phrases.length) slide.highlight = phrases;
    else delete slide.highlight;
  }

  return slide;
}

/**
 * One slide with the field names the model reaches for read as the schema's
 * own (`notes` is `speakerNotes`, `items` is `bullets`), before it is checked.
 */
export function normalizeSlideFields(raw: unknown): Record<string, unknown> {
  const slide = normalizeSlide(raw);
  return slide && typeof slide === 'object' && !Array.isArray(slide) ? (slide as Record<string, unknown>) : {};
}

/**
 * The most a context slide holds, and the list it holds them in. A slide the
 * model filled past it is split into even slides of the same kind (the
 * Grapes of Wrath deck on the preview, Nov 21, had four words on one define
 * slide; the whole deck failed, and the repair turned every context slide
 * into a list).
 */
const SPLIT_LISTS: Record<string, { key: string; max: number }> = {
  define: { key: 'terms', max: 3 },
  person: { key: 'people', max: 4 },
  timeline: { key: 'events', max: 8 },
  map: { key: 'places', max: 8 },
};

function splitFullSlide(slide: unknown): unknown[] {
  if (!slide || typeof slide !== 'object' || Array.isArray(slide)) return [slide];
  const record = slide as Record<string, unknown>;
  const rule = typeof record.layout === 'string' ? SPLIT_LISTS[record.layout] : undefined;
  const list = rule ? record[rule.key] : undefined;
  if (!rule || !Array.isArray(list) || list.length <= rule.max) return [slide];
  const parts = Math.ceil(list.length / rule.max);
  const size = Math.ceil(list.length / parts);
  return Array.from({ length: parts }, (_, i) => ({ ...record, [rule.key]: list.slice(i * size, (i + 1) * size) }));
}

function normalizeDeck(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const deck = raw as Record<string, unknown>;
  if (!Array.isArray(deck.slides)) return raw;
  const out: Record<string, unknown> = { ...deck, slides: deck.slides.map(normalizeSlide).flatMap(splitFullSlide) };
  if (typeof out.art === 'string' && !resolveDeckArt(out.art)) {
    delete out.art;
  }
  return out;
}

/** A fenced block whose JSON is shaped like a deck, whatever its fence says. */
function findDeckBlock(
  content: string
): { block: string; json: string } | null {
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
        return { block: match[0], json: inner };
      }
    } catch {
      // A deck-shaped block we cannot parse still counts as an attempt, so the
      // caller can strip it rather than print it.
      if (/"slides"\s*:\s*\[/.test(inner))
        return { block: match[0], json: inner };
    }
  }
  return null;
}

const MAX_REPORTED_ISSUES = 6;

/**
 * Why a deck was rejected, in the model's own vocabulary.
 *
 * This is not decoration. Without it the only signal anyone gets — teacher,
 * log, or the model itself — is that the deck "didn't come through", which is
 * how the same bug shipped twice.
 */
function describeIssues(error: z.ZodError): string {
  const described = error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map(
      (issue) =>
        `${issue.path.length ? issue.path.join('.') : 'deck'}: ${issue.message}`
    );
  const hidden = error.issues.length - described.length;
  if (hidden > 0) described.push(`and ${hidden} more`);
  return described.join('; ');
}

/**
 * Where the JSON went wrong, in enough detail to fix.
 *
 * A deck written by hand at the end of a long lesson breaks in ordinary ways —
 * an unescaped quote inside a speaker note that quotes the text, a trailing
 * comma, a run that stopped mid-object. "Not valid JSON" is not something
 * anyone can act on; the position and the text around it is.
 */
/**
 * The first quote mark that closes a string somewhere impossible — which is
 * what an unescaped `"` inside a speaker note looks like, and speaker notes
 * quote the text constantly. Runtimes disagree about whether their parse error
 * carries a position, so find it rather than depend on one.
 */
function findJsonBreak(json: string): number | null {
  let inString = false;
  for (let index = 0; index < json.length; index += 1) {
    const character = json[index];
    if (!inString) {
      if (character === '"') inString = true;
      continue;
    }
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character !== '"') continue;
    let next = index + 1;
    while (next < json.length && /\s/.test(json[next]!)) next += 1;
    if (next < json.length && !',:}]'.includes(json[next]!)) return index;
    inString = false;
  }
  return null;
}

function describeBadJson(json: string, error: unknown): string {
  if (!/[}\]]\s*$/.test(json.trim())) {
    return 'The deck JSON was cut off before it finished — it stops mid-object. Write a shorter deck so it completes.';
  }
  const message = error instanceof Error ? error.message : 'invalid JSON';
  const reported = message.match(/position (\d+)/);
  const position = reported ? Number(reported[1]) : findJsonBreak(json);
  if (position === null)
    return `The deck block is not valid JSON (${message}).`;
  const near = json.slice(Math.max(0, position - 80), position + 80);
  return `The deck block is not valid JSON (${message}). Check the quoting near: …${near}…`;
}

/**
 * A trailing comma is the one JSON slip worth forgiving in place: it is
 * unambiguous, and the alternative is spending a model round on a comma.
 */
function withoutTrailingCommas(json: string): string {
  return (
    json
      .replace(/,(\s*[}\]])/g, '$1')
      // \' is never JSON, and always meant an apostrophe: a Dulce et Decorum
      // Est deck on the preview (Nov 22) was lost over "one\'s country".
      .replace(/(^|[^\\])((?:\\\\)*)\\'/g, "$1$2'")
  );
}

export type SlideDeckValidation =
  | { ok: true; deck: SlideDeck }
  | { ok: false; reason: string };

/** Validate deck JSON on its own, without a fence around it. */
export function validateSlideDeck(json: string): SlideDeckValidation {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    try {
      raw = JSON.parse(withoutTrailingCommas(json));
    } catch {
      return { ok: false, reason: describeBadJson(json, error) };
    }
  }
  const normal = normalizeDeck(raw);
  let parsed = deckSchema.safeParse(normal);
  if (!parsed.success) {
    // Too much is not a reason to lose a deck (Nov 22: decks were lost to a
    // seventh agenda line, a sixth timeline entry, a long page note, each
    // found one at a time). A list past its limit keeps its first items and
    // a line past its limit is cut at a word; then the deck is read again.
    const fitted = fittedToLimits(normal, parsed.error.issues);
    if (fitted) parsed = deckSchema.safeParse(fitted);
  }
  if (!parsed.success) {
    return { ok: false, reason: describeIssues(parsed.error) };
  }
  return { ok: true, deck: parsed.data };
}

const TRIMMED_LISTS = new Set(['timeline', 'tasks', 'events', 'places', 'terms', 'people', 'shade', 'highlight', 'agenda']);
const CUT_LINES = new Set([
  'subtitle', 'caption', 'year', 'date', 'label', 'where', 'note', 'detail', 'verb', 'stem', 'grouping', 'routine', 'followUp',
  'course', 'teacher', 'button', 'nextLesson', 'work', 'author', 'attribution', 'page', 'part', 'mode', 'shadeLabel', 'role', 'name', 'shows',
]);

/** The deck with every list and line that was over its limit cut to it; null when nothing was over. */
function fittedToLimits(deck: unknown, issues: z.ZodIssue[]): unknown | null {
  const over = issues.filter(
    (issue): issue is z.ZodIssue & { code: 'too_big'; maximum: number | bigint; type: string } =>
      issue.code === z.ZodIssueCode.too_big && (issue.type === 'array' || issue.type === 'string')
  );
  if (!over.length) return null;
  const copy = structuredClone(deck) as Record<string, unknown>;
  let changed = false;
  for (const issue of over) {
    const path = issue.path;
    if (!path.length) continue;
    // Only where a cut loses nothing a class reads from: a wordy body, too
    // many bullets or facts and a long question are still refused, so the
    // planner rewrites them shorter.
    const field = [...path].reverse().find((key): key is string => typeof key === 'string') ?? '';
    if (!(issue.type === 'array' ? TRIMMED_LISTS : CUT_LINES).has(field)) continue;
    let holder: any = copy;
    for (const key of path.slice(0, -1)) holder = holder?.[key as never];
    const last = path[path.length - 1] as never;
    const value = holder?.[last];
    const max = Number(issue.maximum);
    if (issue.type === 'array' && Array.isArray(value) && value.length > max) {
      holder[last] = value.slice(0, max);
      changed = true;
    } else if (issue.type === 'string' && typeof value === 'string' && value.trim().length > max && max >= 12) {
      const cut = value.trim().slice(0, max - 1).replace(/\s+\S*$/, '');
      holder[last] = `${cut || value.trim().slice(0, max - 1)}…`;
      changed = true;
    }
  }
  return changed ? copy : null;
}

/** A validated deck written back out as the block the renderer reads. */
export function fenceSlideDeck(deck: SlideDeck): string {
  // The kit is how this school draws the deck, not part of it: never stored.
  const { kit: _kit, ...rest } = deck;
  // Nor is which event or place a stepped slide has in focus.
  const stored = { ...rest, slides: rest.slides.map(({ focus: _focus, ...slide }) => slide) };
  return `\`\`\`${SLIDE_DECK_FENCE}\n${JSON.stringify(stored, null, 2)}\n\`\`\``;
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
  | {
      kind: 'unreadable';
      body: string;
      /** The whole fenced block, so a caller can swap a fixed one in place. */
      block: string;
      /** Just the JSON inside it, to hand back to whoever wrote it. */
      json: string;
      reason: string;
    };

export function readSlideDeck(content: string): SlideDeckOutcome {
  const found = findDeckBlock(content);
  if (!found) return { kind: 'none' };

  const body = withoutBlock(content, found.block);
  const validated = validateSlideDeck(found.json);
  if (!validated.ok) {
    return {
      kind: 'unreadable',
      body,
      block: found.block,
      json: found.json,
      reason: validated.reason,
    };
  }

  return { kind: 'deck', deck: validated.deck, body };
}

/** Convenience wrapper for callers that only care about a usable deck. */
export function parseSlideDeck(content: string): ParsedSlideDeck | null {
  const outcome = readSlideDeck(content);
  return outcome.kind === 'deck'
    ? { deck: outcome.deck, body: outcome.body }
    : null;
}

/**
 * What the model should see when its own deck did not render.
 *
 * Replayed history is the only account the model has of what it produced. Left
 * as raw JSON, a deck that failed reads to it as a deck that shipped — which is
 * how a teacher got told to scroll down and look for a viewer that was never
 * on the page.
 */
export const FAILED_DECK_NOTE =
  '[The slide deck you wrote here failed validation. Yawp! never rendered it and the teacher never saw it. If they ask about the deck, believe them, apologise briefly, and build it again from scratch — shorter and simpler. Do not refer back to this one as if it exists.]';

export function markFailedDecks(content: string): string {
  const outcome = readSlideDeck(content);
  if (outcome.kind !== 'unreadable') return content;
  return content.replace(outcome.block, () => FAILED_DECK_NOTE);
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

/** A diagram as a list, for every look that does not draw one: "Couplet: the turn". */
export function diagramLines(slide: Pick<Slide, 'diagram'>): string[] {
  return (slide.diagram?.items ?? []).slice(0, MAX_BULLETS).map((item) => clipTo(item.text ? `${item.label}: ${item.text}` : item.label, MAX_LINE_CHARS));
}

export type ClassicSlide = Slide & { layout: ClassicSlideLayout };

const CLASSIC_SET = new Set<string>(CLASSIC_SLIDE_LAYOUTS);

/**
 * A gallery slide as the nearest classic one, for every renderer that only
 * knows the classic layouts (the tile and plain decks, PowerPoint, the PDF).
 * A classic slide comes back as itself.
 */
export function classicSlide(slide: Slide): ClassicSlide {
  if (CLASSIC_SET.has(slide.layout)) return slide as ClassicSlide;
  const as = (layout: ClassicSlideLayout, extra: Partial<Slide> = {}): ClassicSlide => ({
    ...slide,
    ...extra,
    layout,
  });
  switch (slide.layout) {
    case 'agenda':
      return as('bullets', {
        bullets: (slide.agenda ?? []).map((item) =>
          item.minutes ? `${item.title} (${item.minutes} min)` : item.title
        ),
      });
    case 'discuss':
    case 'look':
    case 'write':
      return as('prompt', { body: slide.question ?? slide.body ?? slide.title });
    case 'big_idea':
      return as('statement');
    case 'notes':
      return as('bullets', {
        bullets: [
          ...(slide.timeline ?? []).map((entry) => `${entry.year}: ${entry.caption}`),
          ...(slide.facts ?? []),
        ].slice(0, 7),
      });
    case 'divider':
      return as('title');
    case 'read':
      return as('bullets', {
        bullets: slide.tasks?.length ? slide.tasks.map((task) => `${task.verb} ${task.text}`) : slide.bullets,
      });
    case 'excerpt':
      return as('quote', { attribution: slide.attribution ?? slide.author });
    case 'exit':
      return as('closing');
    case 'timeline':
      return as('bullets', { bullets: (slide.events ?? []).slice(0, 7).map((event) => `${event.date}: ${event.title}`) });
    case 'define':
      return as('bullets', { bullets: (slide.terms ?? []).map((term) => `${term.word}: ${term.definition}`.slice(0, 200)) });
    case 'person':
      return as('bullets', { bullets: (slide.people ?? []).map((person) => `${person.name}: ${person.role}`.slice(0, 200)) });
    case 'diagram':
      return as('bullets', { bullets: diagramLines(slide) });
    case 'map':
      return as('bullets', {
        bullets: (slide.places ?? [])
          .slice(0, 7)
          .map((place) => `${place.label ?? place.name}${place.note ? `: ${place.note}` : ''}`.slice(0, 200)),
      });
    default:
      return as('statement');
  }
}

/** The teacher's pictures a deck shows, once each, in order (Nov 1). */
export function deckPictureIds(deck: Pick<SlideDeck, 'slides'>): string[] {
  return [
    ...new Set(
      deck.slides.flatMap((slide) => [
        ...(slide.image ? [slide.image] : []),
        ...(slide.people ?? []).flatMap((person) => (person.image ? [person.image] : [])),
        ...(slide.events ?? []).flatMap((event) => (event.image ? [event.image] : [])),
      ])
    ),
  ];
}

