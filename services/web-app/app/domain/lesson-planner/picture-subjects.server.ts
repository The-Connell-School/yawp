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
import { readLenientJson } from './lenient-json';
import type { Slide, SlideDeck } from './slide-deck';

/** Slides that teach something a picture can show. Routine slides (agenda, write, exit…) never ask. */
// Not `discuss`: a Talk slide is a routine slide (R7), and the pictures the
// editor put on them were the decorative ones (a state coach, a picture
// frame, Paul the Apostle: visuals review, Nov 22). The planner may still ask
// for one there itself.
const TEACHING = new Set<Slide['layout']>([
  'notes',
  'big_idea',
  'look',
  'picture',
]);

/** A work's vetted pictures, as the editor is offered them (work-visuals.ts). */
export type PictureKit = {
  title: string;
  author: string;
  visuals: Array<{ subject: string; shows: string; use: string }>;
};
const MAX_SLIDES = 12;
/** Timeline events named per deck: two full timelines. */
const MAX_EVENTS = 16;
const MAX_WORDS = 400;

export const PICTURE_EDITOR_SYSTEM = `You pick the picture for each slide of a lesson deck a teacher will project, so students remember what they read by also seeing it (dual coding).

For each slide you are given, name the exact title of the English Wikipedia article about the concrete thing the slide is about: a real person, place, event, object, building, document or work of art whose picture would help a student remember the slide. Its lead picture will be shown beside the slide's words.

Rules:
- The specific thing, never a general topic. "Levittown, New York", not "Suburb" or "Postwar America". "Dust Bowl", not "Drought".
- Real things only. A character in a novel has no photograph: name the real person, place or event the slide points to, a well-known painting or engraving of the scene by the title of its own article (a Romantic painting of Macbeth's witches, an illustration from the first edition), or nothing.
- Never the film of the book being taught.
- Never the article about a book published after 1930: its picture is a cover, often a later or foreign edition's (Kevin, Nov 25). Name the author or the book's world instead.
- For a slide about the Holocaust, a genocide, a massacre, a lynching or other mass death or cruelty, give null: those pictures are always the teacher's choice.
- A lesson on a book, play or poem has a real world to show, so a slide about an idea in the work still has a picture. Look for, in this order: a well-known painting, engraving or illustration of the scene or the character's moment (by its article's title); the real place or period the work is set in, as it was then ("Trench warfare", "Western Front (World War I)", "Harlem Renaissance"); the real object or practice the slide names ("Gas mask", "Elizabethan theatre"); the work's first edition or first performance; the author (once in a deck). A slide on a sonnet, a soliloquy or an aside can show the theatre, the play's famous staging in art, or the poet.
- Give each slide a different subject; never the same picture twice in a deck.
- Give null only when the slide is a routine instruction (find a word, write a sentence, talk to a partner) or about the students themselves, or when nothing real fits. A wrong picture is worse than none, but most slides about a work have a right one.
- Never a category when a specific thing exists: an article about a kind of thing shows whatever example its editors chose (a present-day rescue team for "Gas mask", a cathedral for "Porch"). Name the particular one from the work's time and place ("Lower East Side Tenement Museum", not "Tenement"; "Harlem Renaissance", not "Neighborhood").
- Never a metaphor: no picture frame for a frame narrative, no mask for identity, no scales for justice. A picture that is not the thing the slide teaches only decorates, and decoration costs learning.
- When vetted pictures for the work are listed, choose from that list first, by the exact title given, each at most once, for the slide it fits. Go outside the list only when no listed picture fits a slide and you are sure of a specific article.
- Timeline events, when listed: name the article about the historical event itself, so the timeline shows what happened. A famous event has a famous picture: "Birmingham campaign" for "Marches begin, April 1963", "Battle of the Somme" for "The Somme, 1916", "Wall Street Crash of 1929", "Montgomery bus boycott", "Nigerian independence" as its article is titled. Each event its own article, never the same one twice and never one a slide already has; when two events belong to one larger event, name the more specific article for one (an arrest, a speech, a treaty, a document) or null. The article for a war, a reform or a movement often opens with a map or a chart, which will not be shown: name instead the person who led it, the building, or a well-known painting or statue of the moment, by its own article ("Cleisthenes" for the first Athenian democracy, "Pericles" for the age of Athens, "The Death of Socrates" for Socrates' trial). An event in the author's life or the book's history (born, wrote, published) takes the person, the place or the first edition by its article, or null. An event inside the story itself, or one no article is about, gets null. A massacre, a genocide or a lynching gets null, as above.
- Pictures of the work's world, when listed (several on one slide: the ruins today, the place as it was, an object of the time): name for each the article whose lead picture is that very thing ("Parthenon", "Theatre of Dionysus", "Acropolis of Athens", a museum piece by its own article), each different from the others and from every slide.
- "shows": a few words on what the picture should show.
- "world": the exact title of the Wikipedia article whose lead picture shows the world of the work this deck teaches, for its title slide, where it is drawn as a print: the real place it is set in or comes from, as a photograph taken on the ground would show it (a town, a building, a street, a landscape, a ruin; never a satellite or aerial view, which prints as an abstract): "Aracataca", "Theatre of Dionysus", "Glamis Castle", "Harlem", "Dust Bowl". Never a person, a map, a book cover, a painting or a film, and never an article a slide below already asks for: when the slides have the town, name another view of the same world (a river, a street, a building, the region). Null when there is none, and for a lesson that teaches a skill.
- "author": the exact title of the Wikipedia article about the author of the work this deck teaches (or the real person the lesson is about), or null when there is none. A lesson that teaches a skill (grammar, an argument, research, a kind of writing) with no work or person at its center has none: null.

Answer with JSON only, no other text:
{"author": "<article title>" or null, "world": "<article title>" or null, "slides": [{"slide": <number>, "subject": "<article title>" or null, "shows": "<what it shows>"}], "events": [{"event": "<slide>.<event>", "subject": "<article title>" or null, "shows": "<what it shows>"}]}`;

const Answer = z.object({
  author: z.string().nullable().optional(),
  world: z.string().nullable().optional(),
  slides: z.array(
    z.object({
      slide: z.coerce.number().int(),
      subject: z.string().nullable().optional(),
      shows: z.string().nullable().optional(),
    })
  ),
  events: z
    .array(
      z.object({
        event: z.coerce.string(),
        subject: z.string().nullable().optional(),
        shows: z.string().nullable().optional(),
      })
    )
    .optional(),
});

/** The answer's shape, for the API's structured outputs. */
export const PICTURE_EDITOR_SCHEMA = {
  type: 'object',
  properties: {
    author: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    world: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slide: { type: 'integer' },
          subject: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          shows: { type: 'string' },
        },
        required: ['slide', 'subject', 'shows'],
        additionalProperties: false,
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          subject: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          shows: { type: 'string' },
        },
        required: ['event', 'subject', 'shows'],
        additionalProperties: false,
      },
    },
  },
  required: ['author', 'world', 'slides', 'events'],
  additionalProperties: false,
} as const;

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

type TimelineEvent = NonNullable<Slide['events']>[number];

/**
 * The timeline events that have no picture and ask for none, as "<slide>.<event>"
 * (both 1-based). Left alone, an event is searched by its own words ("Marches
 * begin 1963"), which are rarely an article's: about a third of the pictures
 * missed in the visuals test (Nov 23). Kevin: a timeline should show the
 * famous events themselves, not only people, places and objects.
 */
export function eventsWithoutSubjects(
  deck: Pick<SlideDeck, 'slides'>
): Array<{ id: string; slide: number; index: number; event: TimelineEvent; scene?: true }> {
  return deck.slides
    .flatMap((slide, i) => [
      ...(slide.events ?? []).map((event, k) => ({ id: `${i + 1}.${k + 1}`, slide: i + 1, index: k, event })),
      // A world slide's pictures (Kevin, Nov 23) are asked about the same way: each by its words.
      ...(slide.events?.length
        ? []
        : (slide.scenes ?? [])
            .filter((scene) => !scene.image && !scene.wants)
            .map((scene) => ({
              id: `${i + 1}.${(slide.scenes ?? []).indexOf(scene) + 1}`,
              slide: i + 1,
              index: (slide.scenes ?? []).indexOf(scene),
              event: { date: '', title: scene.label, ...(scene.note ? { detail: scene.note } : {}) } as TimelineEvent,
              scene: true as const,
            }))),
    ])
    .filter(({ event }) => !event.image && !event.wants)
    .slice(0, MAX_EVENTS);
}

/** What the editor is shown: the deck's title, then each slide it is asked about, then each timeline event. */
export function pictureEditorPrompt(
  deck: Pick<SlideDeck, 'title' | 'unit' | 'slides'>,
  slides: Array<{ number: number; slide: Slide }>,
  kit?: PictureKit | null,
  events: Array<{ id: string; event: TimelineEvent; scene?: true }> = []
): string {
  const lines = [
    `Deck: ${deck.title}${deck.unit ? ` (${deck.unit})` : ''}`,
    '',
  ];
  if (kit?.visuals.length) {
    lines.push(`Vetted pictures for ${kit.title} (each checked; use these titles first, each at most once):`);
    for (const visual of kit.visuals) lines.push(`- ${visual.subject} — ${visual.shows} (${visual.use})`);
    lines.push('');
  }
  // What other slides already show, so the title's world is a different view of it (Nov 25).
  const taken = [...new Set(deck.slides.flatMap((slide) => [slide.wants?.subject, ...(slide.people ?? []).map((person) => person.wants?.subject ?? person.name)]).filter((subject): subject is string => Boolean(subject)))];
  if (taken.length) lines.push(`Slides already ask for: ${taken.join('; ')}`, '');
  for (const { number, slide } of slides) {
    lines.push(`Slide ${number} (${slide.layout}): ${slide.title}`);
    const words = slideWords(slide);
    if (words) lines.push(words);
    lines.push('');
  }
  const onLine = events.filter((entry) => !entry.scene);
  const scenes = events.filter((entry) => entry.scene);
  if (onLine.length) {
    lines.push('Timeline events (each by its id):');
    for (const { id, event } of onLine)
      lines.push(`Event ${id}: ${event.date} — ${event.title}${event.detail ? `. ${event.detail}` : ''}`);
  }
  if (scenes.length) {
    lines.push('', 'Pictures of the work\'s world, side by side on one slide (each by its id, answered in "events" like an event):');
    for (const { id, event } of scenes) lines.push(`Picture ${id}: ${event.title}${event.detail ? `. ${event.detail}` : ''}`);
  }
  return lines.join('\n').trim();
}

/** The editor's answer, read leniently: the first JSON object in it, checked. Anything else is nothing. */
export function readPictureEditorAnswer(
  text: string
): Array<{ slide: number; subject: string; shows?: string }> {
  const answer = readLenientJson(text, Answer);
  if (!answer) return [];
  return answer.slides.flatMap((entry) => {
    const subject = entry.subject?.trim();
    // A title is a title: one too long to be one is no answer, not a shortened one.
    if (!subject || subject.length > 120 || /^(null|none|n\/a)$/i.test(subject))
      return [];
    const shows = entry.shows?.trim().slice(0, 160);
    return [{ slide: entry.slide, subject, ...(shows ? { shows } : {}) }];
  });
}

/** The editor's answer for timeline events, by "<slide>.<event>" id. */
export function readPictureEditorEvents(
  text: string
): Array<{ event: string; subject: string; shows?: string }> {
  const answer = readLenientJson(text, Answer);
  return (answer?.events ?? []).flatMap((entry) => {
    const subject = entry.subject?.trim();
    const id = entry.event.trim().replace(/^event\s*/i, '');
    if (!/^\d+\.\d+$/.test(id) || !subject || subject.length > 120 || /^(null|none|n\/a)$/i.test(subject)) return [];
    const shows = entry.shows?.trim().slice(0, 160);
    return [{ event: id, subject, ...(shows ? { shows } : {}) }];
  });
}

/** The author the editor named, as a Wikipedia title; null when it named none. */
export function readPictureEditorAuthor(text: string): string | null {
  const author = readLenientJson(text, Answer)?.author?.trim();
  return author && author.length <= 80 && !/^(null|none|n\/a|unknown)$/i.test(author) ? author : null;
}

/** The work's world the editor named for the title slide; null when it named none. */
export function readPictureEditorWorld(text: string): string | null {
  const world = readLenientJson(text, Answer)?.world?.trim();
  return world && world.length <= 80 && !/^(null|none|n\/a|unknown)$/i.test(world) ? world : null;
}

export type AskEditor = (system: string, prompt: string) => Promise<string>;

/**
 * The deck with a subject named for each teaching slide that had none, as
 * far as the editor could. Any failure leaves the deck as the planner wrote it.
 */
export async function withNamedSubjects<T extends SlideDeck>(
  deck: T,
  ask: AskEditor,
  kit?: PictureKit | null
): Promise<{ deck: T; named: number; author: string | null; world?: string | null }> {
  const slides = slidesWithoutSubjects(deck);
  const events = eventsWithoutSubjects(deck);
  if (!slides.length && !events.length) return { deck, named: 0, author: null };
  let answer: string;
  try {
    answer = await ask(
      PICTURE_EDITOR_SYSTEM,
      pictureEditorPrompt(deck, slides, kit, events)
    );
  } catch {
    return { deck, named: 0, author: null };
  }
  const author = readPictureEditorAuthor(answer);
  const world = readPictureEditorWorld(answer);
  const asked = new Set(slides.map(({ number }) => number));
  const named = new Map<number, { subject: string; shows?: string }>();
  for (const entry of readPictureEditorAnswer(answer))
    if (asked.has(entry.slide) && !named.has(entry.slide))
      named.set(entry.slide, entry);
  // One subject, one place: an event never repeats what a slide or another event asked for.
  const taken = new Set<string>();
  for (const slide of deck.slides) {
    if (slide.wants) taken.add(pictureKeyOf(slide.wants.subject));
    for (const event of slide.events ?? []) if (event.wants) taken.add(pictureKeyOf(event.wants.subject));
    for (const scene of slide.scenes ?? []) if (scene.wants) taken.add(pictureKeyOf(scene.wants.subject));
  }
  for (const want of named.values()) taken.add(pictureKeyOf(want.subject));
  const askedEvents = new Set(events.map(({ id }) => id));
  const namedEvents = new Map<string, { subject: string; shows?: string }>();
  for (const entry of readPictureEditorEvents(answer)) {
    const key = pictureKeyOf(entry.subject);
    if (!askedEvents.has(entry.event) || namedEvents.has(entry.event) || taken.has(key)) continue;
    taken.add(key);
    namedEvents.set(entry.event, entry);
  }
  if (!named.size && !namedEvents.size) return { deck, named: 0, author, world };
  const wantOf = (want: { subject: string; shows?: string }) => ({
    subject: want.subject,
    ...(want.shows ? { shows: want.shows } : {}),
  });
  return {
    author,
    world,
    deck: {
      ...deck,
      slides: deck.slides.map((slide, i): Slide => {
        const want = named.get(i + 1);
        const withEvents = slide.events?.some((_, k) => namedEvents.has(`${i + 1}.${k + 1}`))
          ? {
              events: slide.events.map((event, k) => {
                const eventWant = namedEvents.get(`${i + 1}.${k + 1}`);
                return eventWant ? { ...event, wants: wantOf(eventWant) } : event;
              }),
            }
          : {};
        const withScenes =
          !slide.events?.length && slide.scenes?.some((scene, k) => !scene.wants && !scene.image && namedEvents.has(`${i + 1}.${k + 1}`))
            ? {
                scenes: slide.scenes.map((scene, k) => {
                  const sceneWant = !scene.wants && !scene.image ? namedEvents.get(`${i + 1}.${k + 1}`) : undefined;
                  return sceneWant ? { ...scene, wants: wantOf(sceneWant) } : scene;
                }),
              }
            : {};
        return want || withEvents.events || withScenes.scenes ? { ...slide, ...(want ? { wants: wantOf(want) } : {}), ...withEvents, ...withScenes } : slide;
      }),
    },
    named: named.size + namedEvents.size,
  };
}

const pictureKeyOf = (subject: string) => subject.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The title slide's picture. First (visuals review, Nov 22: 21 title slides,
 * none with a picture) it was the author's face; then (Kevin, Nov 25: a
 * candid snapshot of García Márquez "kinda stinks", an engraved portrait
 * "looks like a weird obituary") it is the book's world, a real place drawn
 * as a screen print beside the title, the way a poster for the book would be.
 * The world comes from the work's vetted pictures (its setting or period),
 * then the one the picture editor named. Only a lesson with neither has the
 * author on its title slide, as before, and only when no other slide shows
 * them. Set here so it never depends on the planner remembering.
 */
/**
 * The author for the title slide, when its world was asked for and not found
 * (Nov 25: the Chronicle deck's town was not found, and the title slide was
 * left bare). Null when another slide already shows them.
 */
export function titleAuthorWant(deck: SlideDeck, { kit, author }: { kit?: PictureKit | null; author?: string | null }): { subject: string; shows: string; own: true } | null {
  const kitAuthor = kit?.visuals.find((visual) => visual.use === 'author');
  const who = kitAuthor?.subject ?? author ?? null;
  if (!who) return null;
  const shown = deck.slides.some(
    (slide) =>
      slide.layout !== 'title' &&
      ((slide.wants && pictureKeyOf(slide.wants.subject) === pictureKeyOf(who)) ||
        (slide.people ?? []).some((person) => pictureKeyOf(person.wants?.subject ?? person.name) === pictureKeyOf(who)))
  );
  return shown ? null : { subject: who, shows: kitAuthor?.shows ?? 'a portrait of the author', own: true };
}

export function withTitlePicture<T extends SlideDeck>(
  deck: T,
  { kit, author, world }: { kit?: PictureKit | null; author?: string | null; world?: string | null }
): T {
  const at = deck.slides.findIndex((slide) => slide.layout === 'title');
  if (at < 0 || deck.slides[at]!.image || deck.slides[at]!.wants) return deck;
  const asked = new Set<string>();
  for (const slide of deck.slides) {
    if (slide.wants) asked.add(pictureKeyOf(slide.wants.subject));
    for (const person of slide.people ?? []) asked.add(pictureKeyOf(person.wants?.subject ?? person.name));
    for (const scene of slide.scenes ?? []) if (scene.wants) asked.add(pictureKeyOf(scene.wants.subject));
    for (const event of slide.events ?? []) if (event.wants) asked.add(pictureKeyOf(event.wants.subject));
  }
  const kitWorld = ['setting', 'period']
    .map((use) => kit?.visuals.find((visual) => visual.use === use && !asked.has(pictureKeyOf(visual.subject))))
    .find(Boolean);
  // A world only for a lesson on a work: one that teaches a skill has no author,
  // and its example sentences are not its world (Nov 25: a semicolons lesson
  // got the Salinas Valley).
  const editorWorld = world && (author || kit) && !asked.has(pictureKeyOf(world)) ? world : null;
  const kitAuthor = kit?.visuals.find((visual) => visual.use === 'author');
  const who = kitAuthor?.subject ?? author ?? null;
  let want: { subject: string; shows?: string; own?: true; print?: true } | null = null;
  if (kitWorld) want = { subject: kitWorld.subject, ...(kitWorld.shows ? { shows: kitWorld.shows } : {}), print: true };
  else if (editorWorld) want = { subject: editorWorld, shows: 'the place the work is set in', print: true };
  else if (who && !asked.has(pictureKeyOf(who))) want = { subject: who, shows: kitAuthor?.shows ?? 'a portrait of the author', own: true };
  if (!want) return deck;
  return { ...deck, slides: deck.slides.map((slide, i) => (i === at ? { ...slide, wants: want! } : slide)) };
}
