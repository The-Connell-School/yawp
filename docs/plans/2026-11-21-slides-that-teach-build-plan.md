# Slides that teach: rules and build plan

Nov 21, 2026. Source: Kevin's review of the Lesson Planner's deck for day 1 of
a unit on *The Leopard* ("Sicily and the Risorgimento", 13 slides), the
historical context day. Paths are relative to `services/web-app/app/` unless
they start with a top-level folder.

> "This is not thinking like we would think as English teachers. There's not
> even a map of Italy featured here. Some kids may not be used to seeing Italy
> on a world map. There aren't pictures from the movie, there aren't
> definitions of aristocracy or unification … the Turner painting works … but
> it's a forced metaphor when you don't have … any pictures of Italy or the
> people or kinds of characters involved. No timeline. No map. … This is
> exactly the kind of AI generated, lifeless stuff people don't want … we have
> to design against this tendency."

## Status, Nov 21

Built on `claude/context-tools-timeline-map` (PR #997), behind
`lesson_planner_context_tools` except where noted. Each change was written
test first.

Done:

- **Phase 0.** The exit slide's doubled strings are fixed for every deck: a
  deck is read with "open it in Yawp!" and "Next time:" taken off what the
  model wrote, and the prompt asks for the name only. With the flag on, the
  kit's aim is the subject's world, not a painting; a painting is never a
  metaphor for a lesson's history; and a reading slide without its passage
  names the page and asks the teacher for it.
- **Phase 1.**
  - The context-lesson prompt: where, when, who, which words, what it looked
    like, and why it matters to the book, planned before the deck.
  - `define` (words) and `person` (people) slides, drawn by the kit, typed on
    in the studio, and shown as a list in the older looks.
  - Wide maps (`"wide": true`) that show a country among its neighbours,
    before a closer map.
  - The demo pass's findings: no line across wide maps (coasts on the 180th
    meridian), no mid-word breaks on a full timeline, 30 English and older
    place names (Geneva, Mantua, Ypres, Auschwitz, Archangel…), names kept
    clear of other pins, and a closer view for several places together.

- **R12, the arc of a lesson** (Kevin, Nov 21, second round): told to the
  planner with the flag on, for every lesson plan, not only decks: open on
  the theme in the students' own lives (always on a unit's first day), a short
  "what do you know", short direct teaching, then the novel against what the
  students said, with time alone, together and taught.

- **Phase 2, first slice** (behind `lesson_planner_found_pictures`, off by
  default, on in previews):
  - The planner's `find_pictures` tool: Yawp! searches Wikimedia Commons,
    keeps only public domain, CC0, CC BY and CC BY-SA bitmaps wide enough to
    project, and stores up to three per search with the lesson (a few searches
    a turn). On a lesson's first turn they are kept before the lesson exists
    and attached when it is written.
  - The picture table gains `origin`, `credit`, `license` and `sourceUrl`
    (migration `20261121130000_lesson_plan_found_pictures`, all optional).
  - Every found picture shows its credit and license, read from the
    collection, never written by the model: on every screen, in the three
    PowerPoint looks and both PDF paths.
  - The prompt tells the planner when to search, and that film stills, book
    covers in copyright and living people still come from the teacher.
  - Checked against real Commons responses (13 public-domain files and the
    Wellcome Collection's CC BY scans). The live search could not be run from
    the build machine (Commons rate-limits it); it needs a pass on the
    preview.

Not done yet:

- The image-reuse cap and the empty-reading check as code (phase 0 is in the
  prompt only; the checks move to the deck lint in phase 4).
- Pins of places a few miles apart can still sit on each other (Great Neck
  and Port Washington): this needs pointer lines or finer coast data.
- Phase 2's other parts: the studio's "Pictures Yawp! found" review and
  swap, the fetcher's shared cache and queue, and region maps (Natural Earth
  first-level regions for approximate historical states).
- Phases 3 and 4.
- Not checked: the planner writing these slides with the model (needs the
  preview with the flag on), PowerPoint and the PDF by eye for the two new
  slides.

## 1. What the deck had

| | In the deck |
|---|---|
| Slides | 13 |
| Slides with no picture, map or diagram | 9 |
| Pictures | 4, all the same painting (Turner, *The Fighting Temeraire*): title, a cropped strip beside "Italy did not exist…", a Look slide, the exit |
| Maps | 0 (the deck says "a patchwork of kingdoms" in words) |
| Timelines | 0 (three dated events as a numbered list on a "Do" slide; the lesson's own "timeline sort" has no timeline on screen) |
| People | 0 faces, and Garibaldi appears only as a name |
| The novel's characters | 0 (no Prince of Salina, Tancredi, Angelica, Don Calogero or Donnafugata) |
| Words defined | 0 (aristocracy, unification, Risorgimento, Bourbon and plebiscite are all used and none is defined) |
| The film | 0 (Visconti, 1963) |
| The reading | A slide titled "Garibaldi's invasion" with annotation tasks and no excerpt on it |
| Bugs on screen | "Exit ticket: open it in Yawp!: open it in Yawp!" and "Next time: Tomorrow: …" |

The routine slides (Write, Talk, Do, Exit) are sound. The class starter
works, and the circle/underline/"whose progress?" annotation is a good
English-class move. What fails is everything that should have given students
the world of the book.

## 2. Why it came out this way

The planner did what it was told. The causes are in our instructions and our
templates, not in a bad roll of the model.

1. **The kit's aesthetic is a painting, not the subject.** The v4/v4.1
   prompt opens "every deck should feel like a quiet, well-made book with one
   painting inside it" (`routes/api.domain.lesson-planner/build-system-prompt.ts`,
   `buildDeckKitV4Section`). A later line says the painting is optional and must
   fit the lesson's subject, but the opening sets the goal. With nothing else
   to show, the model reached for the one picture it could get.
2. **The only pictures the planner can reach are seven paintings**
   (`domain/lesson-planner/deck-art.ts`). It has no tool to find a map, a
   portrait, a photograph of a place or a page of a newspaper. The teacher's
   own pictures (`picture` layout) only exist if the teacher uploaded some.
3. **The templates are classroom routines** (agenda, steps, discuss, write,
   read, look, exit). Only one teaches content (`notes`, a split slide with up
   to 5 timeline captions or 3 facts). Nothing exists for a word, a person, a
   place, or a picture of the world of the book. A context day comes out as
   routines with nothing to show.
4. **No rule says what a context day must contain.** The prompt is detailed
   on rhythm, labels, type and color, and silent on the questions an English
   teacher answers before a class reads a novel: where, when, who, which words,
   what it looked like.
5. **The excerpt rule leaves an empty slide.** The model may only put a
   passage on a slide when the teacher supplied it or a tool returned it,
   which is right, but nothing tells it what to do when it has neither. It
   kept the slide and left the passage off.
6. **Maps and timelines are built but off** (PR #997, behind
   `lesson_planner_context_tools`).
7. **Two strings are doubled.** The prompt tells the model to write "Exit
   ticket: open it in Yawp! before you go", and `deck-kit-v4.ts` appends
   ": open it in Yawp!" to `button` again. The same thing happens with
   "Next time:" and a `nextLesson` that starts "Tomorrow:".

## 3. Rules

Each rule comes from a line of Kevin's review, and each can be checked on a
finished deck. The checks are what section 5 builds.

**R1. Think like an English teacher: a context day equips students to read
this book.** Before a deck is written, the planner names what students need to
read the opening chapters: the places, the dates, the people (real and
fictional), the words, and what that world looked like. The deck covers each.
*Check:* a context lesson's deck has at least one slide answering each of
where, when, who, which words and what it looked like.

**R2. Show where, starting from what students know.** Every place a lesson
depends on goes on a map. When students may not know where it is in the world,
the map starts from the world or the continent and then zooms in: the world,
then Italy, then Sicily.
*Check:* a lesson that names a country, region or city students are expected
to know has a map slide, and the first map of a deck has a locator.

**R3. Show when on a timeline, never in a list.** Three or more dates make a
timeline slide. History goes above the line and the book or its author below.
A sorting activity is answered on a timeline.
*Check:* no slide lists three or more dates as bullets.

**R4. Show who.** Real people get their faces, from public-domain portraits
and photographs. The novel's main characters are introduced by name, with who
they are in a line, before students meet them in the text. A film adaptation
gets a still, which the teacher adds (see R10).
*Check:* every real person named on a slide has a picture somewhere in the
deck, and a novel's context day introduces its main characters.

**R5. Define the words.** Any word the lesson depends on that a student of this
grade may not know (aristocracy, unification, Risorgimento, Bourbon,
plebiscite) is defined on screen: the word, a plain definition, an example from
the book's world, and a picture when one helps.
*Check:* each key term used on a slide is defined on a slide at or before its
first use.

**R6. Pictures from the subject's world, not metaphors.** A picture shows the
actual time, place, people, objects or text. A metaphor image (Turner's
*Temeraire* for the Sicilian aristocracy) is allowed once, as a deliberate
Look, after the real pictures. It is never a stand-in for missing ones and
never the face of the deck. No image appears twice except a deliberate return
at the close.
*Check:* the title image and every content image come from the subject's
world; no image is used more than twice.

**R7. Every content slide has something to look at.** Routine slides (Write,
Talk, Exit) may be words only. A slide that teaches content carries a map, a
timeline, a picture, a portrait, a document, a film still or a chart, and a
context deck can't be mostly routine slides.
*Check:* at least half the slides in a context lesson carry a visual, and no
content slide is text only.

**R8. Connect the history to the book on screen.** Name the novel's people and
places beside the history: the Prince of Salina as one of the aristocrats,
Tancredi joining Garibaldi, the plebiscite as it happens in Donnafugata, the
line "If we want things to stay as they are, things will have to change."
*Check:* the novel is named on at least one content slide beyond the title,
with a character or place.

**R9. No reading slide without the reading.** A passage the class annotates is
on the slide, or the slide says exactly where to find it (book, page) and the
chat asks the teacher for the passage. A titled reading slide with tasks and
no text never ships.
*Check:* an `excerpt` or `read` slide has its text, or a `page` and a request
in the reply.

**R10. When Yawp! can't supply it, leave a labeled slot and say so.** Film
stills, copyrighted photographs and passages the planner can't quote become
visible slots ("Add a still from Visconti's film: the ball scene") with a
one-line note in the reply. Never quietly substitute something else.
*Check:* every slot is listed in the reply, and no slot ships empty to
Present without a warning.

**R11. Check what the AI wrote, and credit what we show.** Dates, places and
quotations the model wrote are marked "check before class" in the studio, as
timelines already are. Every picture carries its credit and license.
*Check:* no uncredited picture appears on a slide.

**R12. The arc of a lesson: start with the students and the theme, then
bring in the text.** Added by Kevin, Nov 21, after reading R1 to R11.

1. *Open on the theme, in the students' own experience.* Always on the first
   day of a unit, and in most lessons. For *The Leopard*: "What do you think
   it's like to lose power? How does it happen? Can you relate to ever having
   a certain way of life and losing it? What do you think happens to someone
   who loses power or status or popularity?" In the middle of a unit, once
   the core themes are established, a lesson may open by recalling what came
   earlier instead.
2. *At the start of a unit, find out what they know.* "What do you know about
   WWII or the Holocaust?" or "What do you think Italy was like before it was
   a country?" The less you think they know, the shorter this part.
3. *Then teach directly.* Short, punchy pieces of information told to them
   directly, the key terms and vocabulary among them. This is where the maps,
   timelines, words and people (R2 to R5) go.
4. *Then tie the novel to the thematic questions.* Get students to weigh in
   on the theme, then set the novel's treatment of it beside what they said.
   This part has individual time to think and write, time to discuss with
   peers, and time for the teacher to teach directly.

*Check:* the first lesson of a unit opens on a thematic question about the
students' own lives, followed by a short "what do you know", before any
direct instruction. The plan names the four parts in order, and the novel
section refers back to the opening question.

## 4. What the Leopard day 1 deck should have been

This is the target, slide by slide, so the rules have a picture. It follows
R12's arc. Pictures marked *teacher* are ones Yawp! can't ship and asks for
(R10).

*Open on the theme (R12.1)*

1. Title: *The Leopard*, day 1, over a 19th-century photograph of Palermo.
2. Today (agenda).
3. Write: "What do you think it's like to lose power? How does it happen?
   Have you ever had a way of life and lost it?" Four minutes alone, then a
   few shares. The teacher keeps a list on the board; the class comes back to
   it.

*What do you know (R12.2), short*

4. Talk: "What do you think Italy was like before it was a country?" Two
   minutes in pairs, then a quick share.

*Teach directly (R12.3)*

5. Map, wide: where is Italy? Italy shaded among its neighbours.
6. Map: Italy in 1860, a patchwork: Palermo, Naples, Rome and Turin pinned
   (later, phase 2: the Kingdom of the Two Sicilies, the Papal States and
   Piedmont-Sardinia shaded approximately).
7. Words: aristocracy, unification and Risorgimento, each with a plain
   definition and an example from the book's world.
8. Who: Garibaldi (a public-domain photograph) and the Thousand in red shirts.
9. Timeline, 1860–1861: Marsala, Palermo, the plebiscite, the Kingdom of
   Italy. Below the line: the novel opens in May 1860, the plebiscite in
   Donnafugata, and the novel published in 1958.
10. Map: Garibaldi's route: Marsala, Calatafimi, Palermo, Naples, Teano.

*The novel against what they said (R12.4)*

11. Who's who in the novel: the Prince of Salina (the Leopard), Tancredi,
    Angelica and Don Calogero, each a line, each with a film still (*teacher*).
12. Read: the excerpt on the slide (*teacher* supplies it, or the page), with
    the circle and underline tasks. Alone.
13. Talk: "Look at the board: what did we say losing power is like? Is that
    what happens to the Prince?" Pairs, then the teacher draws it together
    and names the novel's view ("If we want things to stay as they are,
    things will have to change").
14. Before you go: "Unification cost the Sicilian aristocracy ___."

The Turner can be dropped. If it stays, it is one Look slide after the real
pictures, never the deck's face.

## 5. Build plan

The UI work rides on the kit (v4.1) and the deck studio, as #997 does. Each
phase is behind a review flag and off by default, per AGENTS.md.

### Phase 0: this week, small fixes

- **The doubled strings.** Make `deck-kit-v4.ts` strip a trailing ": open it in
  Yawp!" (and "before you go") from `button`, and a leading "Next time:" or
  "Tomorrow:" from `nextLesson`, before setting the line. Fix the two prompt
  lines that ask for the full string. Unit test both.
- **The painting's job.** Replace "every deck should feel like a quiet,
  well-made book with one painting inside it" with an aim about the subject.
  Keep the look (cream, serif, margins) and drop the painting as the point.
- **One image, used at most twice.** In `repair-slide-deck.server.ts`, drop a
  painting strip from a `big_idea` when the painting is already on the title
  and a Look slide.
- **A reading slide never ships empty (R9).** When an `excerpt`/`read` slide
  has no passage, the repair step turns it into a reading instruction with a
  `page` slot, and the reply asks for the passage.

### Phase 1: ship maps and timelines, and teach the context day

- Merge #997 (deck studio, maps and timelines). Fix what the demo pass found
  first: mid-word breaks, pin collisions, English and older place names
  (Geneva, Auschwitz, Ypres, Archangel), the stray line on wide maps, and the
  zoom floor that stopped a Long Island map.
- **Locator maps (R2).** Add an inset (or a first step) to the map slide
  showing the region on a world or continent outline. Use the same bundled
  data and no new service.
- **The context lesson in the prompt (R1, R3–R8).** Add a section for lessons
  that introduce a text or its history: name the where, when, who, words and
  world first, then build the deck from them. It lists the new templates and
  states the rules as instructions. It is built only when the lesson
  introduces a text, so it does not grow every prompt.
- **`define` template (R5).** One to three words with a plain definition and an
  example sentence from the book's world. On a split slide, with an optional
  picture.
- **`person` template (R4, R8).** A portrait (or a slot), the name, who they
  are in one line, and, for a novel's characters, their place in the story.
  A character slide can hold two to four people as a cast list.
- All of this goes behind `lesson_planner_context_tools`, so it ships with
  maps and timelines.

### Phase 2: pictures that belong

- **A picture finder for the planner (R6, R7).** Add a tool, `find_pictures`,
  that the planner calls with what it needs ("Garibaldi photograph 1860",
  "Palermo 19th century"). Yawp!'s server searches open collections (Wikimedia
  Commons, the Library of Congress, the Met's Open Access, the Rijksmuseum,
  Europeana) and returns candidates with their license, as Yawp! already does
  for places. The model chooses among real results and never writes a URL.
- **Licenses are checked by Yawp!, not the model.** Accept public domain, CC0,
  and CC BY / BY-SA only, and store the credit with the picture. Every slide
  shows the credit (R11).
- **Fetch once, keep it.** Download to our storage (S3) on first use, at slide
  size, and serve from there. Never hotlink. The demo pass hit Wikimedia's rate
  limit (HTTP 429) within minutes, so the fetcher needs a proper User-Agent with
  contact details per Wikimedia's policy, a queue, retries with backoff, and a
  cache shared across schools.
- **The teacher checks them.** The deck studio shows "Pictures Yawp! found",
  each swappable in a click (the studio already swaps a slide's picture), with
  the credit. Present shows nothing unchecked differently. This is review,
  not a gate.
- **Slots for what we can't ship (R10).** Film stills and copyrighted photos
  become labeled picture slots the teacher fills with their own upload (the
  existing `lesson_planner_upload_pictures` path). The studio says such a
  picture is fine in their own classroom and is left out when a lesson is
  shared publicly, which the prompt already says about photographs.
- **Historical maps (R2).** Add Natural Earth's first-level regions (states
  and provinces, public domain) to the bundled data. That ends "no state or
  province lines". It also lets a map shade an approximate historical state as
  a set of today's regions: the Kingdom of the Two Sicilies as Sicily, Campania,
  Calabria, Apulia, Basilicata, Molise and Abruzzo. Such a map is always
  labeled "approximate; today's regions".
- Behind a new review flag, `lesson_planner_found_pictures`.

### Phase 3: side trips

- From the clickable prototype shown to Kevin on Nov 21 (four books, each with three picture-led side trips): a timeline
  event or a map pin holds two to four slides of its own, built from the
  templates above with pictures from phase 2. In Present, ↓ goes in and the
  last slide comes back to the same date. PowerPoint gets internal links in
  and back.
- The schema change is an optional `detour: Slide[]` on an event or a place,
  nested and limited to 4. The studio edits a side trip like a short deck.

### Phase 4: a quality gate and an eval set

- **Deck lint.** Turn each rule's check (section 3) into a function over a
  `SlideDeck`, run after `parseSlideDeck`. A deck that fails gets one repair
  turn (as `repair-slide-deck` does now) with the failures named. A deck that
  still fails is shown, with the gaps listed for the teacher in the studio.
- **An eval set of context days.** Twelve "introduce this text" requests: *The
  Leopard*, *Things Fall Apart*, *Night*, *The Great Gatsby*, *Of Mice and Men*,
  *Frankenstein*, *Romeo and Juliet*, *Persepolis*, *Heart of Darkness*, *Their
  Eyes Were Watching God*, *The Crucible* and *The Kite Runner*. Run each
  before and after every phase, score with the lint, and have Kevin and Brian
  score the decks by eye on a short rubric (does it think like an English
  teacher, would you project it). Ship a phase when the eval set improves and
  nothing regresses.

## 6. Order and size

| Phase | What | Rough size |
|---|---|---|
| 0 | Doubled strings, painting wording, image reuse, empty reading slide | 1 day |
| 1 | Merge #997 with its fixes, locator maps, context-lesson prompt, `define` and `person` | 1–1.5 weeks |
| 2 | Picture finder, licensing, storage, studio review, slots, region maps | 2 weeks |
| 3 | Side trips | 1 week |
| 4 | Deck lint and eval set (start alongside phase 1, grow each phase) | 3–4 days, then ongoing |

## 7. Not in this plan

- Generated images. Pictures come from real collections or the teacher, never a
  model's drawing, for the same reason pins come from Yawp!'s data and never
  the model.
- Licensing commercial photo libraries or film studios.
- Changing the routine templates (Write, Talk, Do, Exit), which work.
