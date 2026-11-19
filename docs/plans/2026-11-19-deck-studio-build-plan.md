# Deck studio: talk to the deck, or edit right on the slide

Build plan, Nov 19, 2026. Source: Brian's note of Nov 18 ("Lesson Planner and
slide decks: the big question"), Kevin's direction of Nov 18 (the deck should
work the way Claude works when it builds a document or a deck with you: chat
with the whole thing, and edit one part by hand), and the mockup
"Lesson Planner deck studio: chat and edit on the slide".

Code facts below were read at `0ebddc0` (main, Nov 18). Paths are relative to
`services/web-app/app/` unless they start with a top-level folder.

## Status, Nov 19

Phases 1 and 2 are built on `claude/ecstatic-noether-o53v08`, with both flags
off by default. Phases 3 to 6 are not started.

Checked:

- Unit tests for the new code: on-slide edits, color-mark parts, the canvas,
  the chat's operations, its server call and its route.
- Browser tests (Chromium), 68 passing: the new
  `teacher.lesson-planner-deck-studio.spec.ts` (9 tests), and the existing
  review, run 2, own deck, kit v4 and kit v4.1 suites, which cover the old
  editor, Present and PowerPoint.
- The kit's layout, compared before and after the sources were added, for 29
  slides in v4 and v4.1, with and without a painting: identical apart from
  the new `source` property.
- Typecheck (`./bin/project verify --profile prepush`).

Not checked:

- A real answer from the model. The browser tests answer the chat's request
  themselves and the unit tests hand in the model's text, as every planner
  test does. The prompt needs a pass on a preview with real decks before
  `lesson_planner_deck_chat` goes on for a school.
- A click on a slide's picture through to the new picture. The button is
  drawn (unit test) and the upload route has its own tests; no browser test
  joins them.
- Firefox, and a phone-width screen.

Screenshots of the built screen: `artifacts/deck-studio/`.

## 1. What we are building

One place to work on a deck, with two ways to change it:

1. **Talk to it.** "Make the opening about the Nile and cut the vocabulary
   slide." Yawp! changes the slides, lists what it changed, and offers one
   Undo.
2. **Edit on the slide.** Click the headline, label or body and type. Click a
   picture to swap it. Or point at one part and ask Yawp! to change only
   that part.

The slide keeps the v4.1 design while it is edited. The slide fields stay
behind the scenes; the teacher never sees a list of them. A teacher's own
uploaded deck opens in the same place, in its own design, and its original
file is never lost.

### Brian's goals, and where each lands

| Goal (Nov 18 note) | Phase |
| --- | --- |
| Edit a template deck right on the slide: headline, label, body, picture | 1 |
| The slide keeps the v4.1 design; a teacher cannot break the layout | 1 |
| No long list of fields under the slide | 1 |
| Ask Yawp! to change the deck, whole or one part (Kevin) | 2 |
| Changes are never lost; Undo survives a reload | 3 |
| An uploaded deck is saved as it is: same slides, design, words, pictures, notes | 4 |
| Use specific slides of it ("my slides 3 to 5 for the opening"), present, download | 4 |
| Edit an uploaded deck on the slide, and by chat | 5 |
| A deck in the Lesson Library in its own right; every field matches v4.1 | 6 |

## 2. What the code does today

- **On-slide editing exists, for the old look only.** The editor
  (`routes/app.lesson-planner_.$conversationId.deck.$deckId/route.tsx`)
  passes `onEdit` to `TileSlideCanvas` (Brian's run 2, C4). With the gallery
  flag on it draws `GallerySlideCanvas`, which has no editing. Every v4 and
  v4.1 deck is form-only. That is what Brian saw.
- **A v4/v4.1 slide is a computed layout.** `layoutKitV4Slide(deck, index)`
  (`domain/lesson-planner/deck-kit-v4.ts`) turns the slide's fields into
  boxes of paragraphs and runs on a 1280×720 canvas. Present
  (`kit-v4-slide-canvas.tsx`), PowerPoint (`lesson-pptx-kit-v4.server.ts`)
  and both PDFs (`lesson-pdf.server.ts`, `drawKitV4Face`) draw those boxes.
  All three read named properties of a run, so an extra optional property
  on a run is ignored by every one of them.
- **A deck is one fenced JSON block.** `yawp-slides`, validated by
  `validateSlideDeck` (`slide-deck.ts`), stored in
  `LessonPlanMaterial.content` (slot `deck`, kind `slides`) once filed or
  edited. Unknown keys are stripped. `saveEditedDeck` sets `editedAt`, which
  makes the planner ask before it replaces a hand-edited deck.
- **There is a working pattern for "one line in, changes applied, one line
  out with Undo":** the stack chat (`stack-command.ts`,
  `stack-command.server.ts`). A zod union of operations, a check pass, a
  small model call through `plannerComplete` (the planner's rate limit and
  logging), and an undo snapshot.
- **The model wrapper has no structured output.** `getLLMCompletion` returns
  the first text block; structured callers ask for JSON and parse it
  leniently (`readCommandResult`). End-to-end tests never call a model:
  replies are seeded or the request is intercepted in the browser.
- **An upload's original file is kept, but not shown.**
  `LessonPlanUpload.file` holds the .pptx (with `lesson_planner_upload_pictures`)
  and `api.lesson-planner-deck.$uploadId` returns it. "Keep it as is" still
  runs `deckFromUpload`, which redraws the words in our template with one
  picture per slide.
- **The .pptx reader reads words and pictures only.** No shape positions,
  placeholders, layouts or fonts (`domain/office/pptx.ts`,
  `pptx-pictures.ts`). `zip.ts` cannot write; `jszip` can, and
  `pptx-embed-font.server.ts` already patches a .pptx and re-zips it.
- **Production is one App Runner service** (1 vCPU, 2 GB, 120-second
  request cap), with no worker, queue or job table. The image has no
  LibreOffice and no fonts. One S3 bucket exists; assignment prompt PDFs
  show the private-file pattern (server put, then an access-checked route
  that redirects to a short signed URL). Previews and end-to-end tests have
  no AWS access and need a local-disk fallback.
- **A Library item is a lesson** (`LessonPlanConversation`). A deck has no
  table of its own.

## 3. Decisions

1. **Template decks stay on the slide model.** The fields are what make
   "cannot break the layout" true: the teacher types, the layout
   recomputes. On-slide editing maps each run on the canvas back to the
   field it came from.
2. **Uploaded decks keep the real .pptx as the source of truth.** They are
   shown as faithful slide images. A text edit patches the slide's XML and
   the slide is drawn again. They are never converted to slide fields unless
   the teacher chooses "Rework it".
3. **Chat edits are operations on the deck the teacher is looking at,**
   checked on the server and applied as one undoable change, following the
   stack chat. The model never writes to the database.
4. **Everything is behind new flags, off by default.** The current editor
   stays for at least two weeks after the studio is on in production
   (AGENTS.md rule 2). Saved decks keep today's storage format through
   phase 2, so nothing that reads a deck changes.
5. **No third party sees a teacher's file.** Slide images are rendered on
   our own AWS account. The privacy page's provider list does not change.

### Flags

| Flag | Needs | Turns on |
| --- | --- | --- |
| `lesson_planner_deck_studio` | deck v2, gallery, kit v4 | The studio editor for v4/v4.1 decks (phase 1) |
| `lesson_planner_deck_chat` | deck studio | Ask Yawp! in the studio (phase 2) |
| `lesson_planner_own_deck_whole` | upload pictures | An uploaded deck kept and shown as it is (phases 4 and 5) |

A new flag touches: `feature-flags.ts` (constant, `FEATURE_FLAGS` entry),
`feature-flags.server.ts` (`getLessonPlannerReviewFlags` and its type),
`packages/prisma/scripts/local-dev/seed-lesson-planner-feature-flag.ts`,
`e2e/feature-flags.ts`, and the expected-key lists in
`feature-flags.test.ts`, `feature-flags.server.test.ts` and
`utils/internal-feature-flags-http.server.test.ts`. New
`*lesson-planner*` unit tests must be named in `.github/workflows/ci.yml`
(`scripts/ci/check-ci-test-list.ts`).

## 4. Phase 1: edit on the slide (template decks)

### 4.1 Where each run's words live

`KitV4Run` gains one optional property. Nothing else about a run changes:
not its text, not the order of runs in a paragraph (the PDF's wrapping and
PowerPoint's line breaks depend on both).

```ts
export type KitV4Source = {
  /** The slide's own field, or the deck's (the unit line on the title slide). */
  on: 'slide' | 'deck';
  field: string;
  /** A list item: bullets[2], agenda[0], tasks[1], choices[3]. */
  index?: number;
  /** A part of an item or column: agenda[].title, tasks[].verb, left.text. */
  key?: string;
  /** Characters at the start or end of run.text that are layout, not the field's words. */
  lead?: number;
  trail?: number;
  /** This run is part N of a field with color marks (~~2|reason~~). */
  segment?: number;
  /** Written when the teacher leaves the box, not on each key. */
  commit?: 'blur';
};
```

`lead` and `trail` exist because some runs carry layout characters:
`"   " + item.title`, `verb + " "`, `"Next time: " + nextLesson`,
`button + ": open it in Yawp!"`. The canvas shows those characters as fixed
text and makes the rest editable. The run's text is not split, so the other
renderers draw exactly what they draw today.

| Template | Editable on the slide (field) | Fixed (not a field) |
| --- | --- | --- |
| title | unit (deck), title, subtitle, teacher, course | art credit |
| agenda | intro line (body or subtitle), each item's title | "Today", numerals, minutes (from the stack) |
| steps | label (mode), title, each step (bullets) | numerals, minutes line |
| discuss | label, title, question (question, else body, else title), stem, follow-up, grouping when it stands alone | grouping joined with minutes |
| notes | label, title, each year and caption (timeline), each fact (facts or bullets) | |
| read | label, title, instruction (subtitle or body), each task's verb and text | source line when work and page are joined |
| excerpt | label, each task's verb and text, the passage (body), author or attribution | joined work and page |
| big_idea | label, statement (body or title), follow-up | art credit |
| write | label, prompt (body, else question, else title), routine, stem or follow-up | the timer |
| divider | title, subtitle | "Step N" / "Part N", art credit |
| look / picture | label, title (picture), routine (look), question, follow-up, attribution (picture) | "N seconds", art credit |
| quiz | question, each choice | "Question n of m", letters |
| exit | statement (body or title), follow-up, button, next lesson | "Before you go", ": open it in Yawp!", "Next time: " |
| compare | title, each column's label and text | |

Rules that keep this honest:

- **A fallback is written back where it was read.** If a discuss slide shows
  `body` because it has no `question`, typing changes `body`.
- **A label is committed on leaving the box.** `labelFor` drops a label that
  repeats the headline, matches the slide before, or (v4.1) tells students
  how to treat the content. Committing on each key would make the box
  vanish mid-word. A default label that the teacher edits is written to
  `mode`; an emptied label is written as `mode: "none"`.
- **Text that the layout rewrites** (`withoutDots(routine)`,
  `cleanLabel(mode)`) is editable as shown; the field takes what the
  teacher typed.
- **Color marks.** A field with marks becomes several runs. Each carries its
  `segment`, and an edit rewrites that segment inside the stored text and
  keeps the others and their marks. A typed `~` is dropped (the mark syntax
  cannot hold one).
- **Limits.** Typing stops at the field's schema limit (title 90, body 320,
  line 200, and so on). Leaving a box empty clears an optional field; if the
  slide would no longer pass `validateSlideDeck`, the words go back to what
  they were.
- **Lists.** Enter in a list item adds an item after it (up to the list's
  limit and the number the template draws: 4 steps, 3 tasks, 3 facts, 5
  timeline entries, 5 choices, 6 agenda items). Backspace in an empty item
  removes it (down to the list's minimum).

### 4.2 Files

| File | Change |
| --- | --- |
| `domain/lesson-planner/deck-kit-v4.ts` | `KitV4Source`; a `from(run, source)` helper; sources on every run in the table above; `marked()` numbers its segments |
| `domain/lesson-planner/deck-colors.ts` | `colorMarkSegments(text)` and `withColorMarkSegment(text, segment, next)` |
| `domain/lesson-planner/deck-on-slide.ts` (new) | Pure: `applySlideText(deck, slideIndex, source, text)`, `insertSlideListItem`, `removeSlideListItem`, `sourceLimit(source)`, `sourceKey(source)` |
| `routes/present.$conversationId.$messageId/kit-v4-slide-canvas.tsx` | Optional `edit` prop; an editable run (the `Words` pattern from the tile canvas: the DOM is left alone while the teacher types); the picture box becomes a button when `edit.onPicture` is given |
| `routes/present.$conversationId.$messageId/gallery-slide-canvas.tsx` | Passes `edit` through to the kit canvas |
| `routes/app.lesson-planner_.$conversationId.deck.$deckId/deck-studio.tsx` (new) | The studio: slide, strip (notes for you, minutes), "More options" (layout, picture, and the current fields, closed by default), slide rail |
| `routes/app.lesson-planner_.$conversationId.deck.$deckId/route.tsx` | Loader returns `studio`; draws `DeckStudio` when the flag is on and the deck is a kit v4 deck, else the current editor, unchanged |
| flag files (section 3) | `lesson_planner_deck_studio` |

Without `edit`, the canvas renders exactly as it does today, so Present,
thumbnails, share pages and Run the show are untouched.

Saving does not change in this phase: the same hidden `deck` field, the same
action, `deckFromEditor` then `saveEditedDeck`, the same Save button and test
ids (`deck-editor-save`, `deck-editor-slide`, `deck-editor-undo`,
`deck-editor-total`, `slide-picture-*`).

### 4.3 Tests (written first)

- `deck-colors.test.ts`: segments round-trip; an edit to one segment keeps
  the others and their marks.
- `deck-on-slide.test.ts` (new): every source kind writes the right field;
  fallbacks write back where read; `lead`/`trail`; limits; list insert and
  remove at their bounds; an edit that breaks validation is refused.
- `deck-kit-v4.test.ts` / `deck-kit-v41.test.ts`: every run with a source
  reads back to its field (`run.text` minus `lead`/`trail` equals the field
  or its segment); fixed text has no source; no run's `text` changed
  (snapshot of texts per template before and after).
- `kit-v4-slide-canvas.test.tsx`: no `edit` prop, no `contenteditable` in
  the markup; with it, sourced runs are textboxes with labels.
- `e2e/tests/teacher.lesson-planner-deck-studio.spec.ts` (new): flag off,
  the current editor; flag on, type in the headline and a bullet, add and
  remove a bullet, edit notes and minutes, save, and Present and the stored
  deck show the change; the form is closed by default; a v3 deck still
  opens the current editor.

### 4.4 Done when

A teacher on a v4.1 school can open a planner deck, change any words drawn on
a slide by typing on it, swap or add a picture, change notes and minutes,
save, and present the result, without opening "More options".

## 5. Phase 2: ask Yawp! in the studio

### 5.1 Shape

The chat works on the deck in the editor, saved or not. One request, one
answer:

```
POST /api/domain/lesson-planner/deck-command
  conversationId, deckId, deck (the working copy, JSON), line,
  selection? { slide, field, index?, key? }
→ { reply, applied, deck?, changes: [{ slide, kind, title }] }
```

Nothing is written to the database by this route. The studio puts the
returned deck in place, keeps the deck before it for Undo, and the teacher
saves as they do after typing. Because no `LessonPlanMessage` is written,
the planner's history and the chat page are unaffected (the planner replays
every message whatever its surface).

### 5.2 Operations

Slides are numbered as in the deck that was sent (1-based).

| Operation | Fields |
| --- | --- |
| `replace_slide` | `slide`, `with` (a whole slide in the deck schema; its notes, minutes and step stay when left out) |
| `add_slide` | `after` (0 for the start), `with` |
| `remove_slide` | `slide` |
| `move_slide` | `slide`, `after` |
| `set_deck` | `title?`, `subtitle?`, `unit?` |

The model writes whole slides because it already knows the slide schema;
there is no second vocabulary of field paths to get wrong. The server works
out the change list from the operations, never from the model's prose.

Checks before anything is applied (`checkDeckOps`):

- Every slide number exists; at most 20 operations; the deck keeps at least
  one slide and at most 40.
- A replaced picture slide keeps its picture unless the new slide names
  another picture already in the deck. A picture id that is not in the deck
  is dropped; a slide that is no longer a picture slide lets its picture go.
- An unknown slide number fails the whole answer: all of it applies or none
  of it does.
- The resulting deck passes `validateSlideDeck`. If it does not, nothing is
  applied and the reply says so.

A selection is not enforced on the server. The model is told the line is
about the part pointed at and to leave everything else alone unless the line
plainly asks for more; the change list shows the teacher exactly what moved,
and Undo puts it back. Enforcing it would refuse "cut the vocabulary slide"
from a teacher who had clicked a headline a minute earlier. Pointing ends
when the teacher changes slides, sends a pointed line, or closes the chip.

### 5.3 Prompt

`deck-command.ts` (pure) builds:

- System: the editor's job in a few lines, the operation format, the slide
  fields per layout (generated from the same constants the editor uses), and
  the kit's writing rules (`buildDeckKitV4Section`, exported from
  `build-system-prompt.ts`, v4 or v4.1 by the school's flags).
- User: the deck as numbered JSON, the lesson's length, the selection as
  "the teacher is pointing at slide 5, its question: …", and the line.

Through `plannerComplete`: the planner's model, the shared 40-an-hour limit,
metadata-only logs, feature `lesson-planner-deck-command`. 6,000 tokens out,
a 60-second deadline (App Runner's cap is 120).

### 5.4 Files

| File | Change |
| --- | --- |
| `domain/lesson-planner/deck-command.ts` (new) | `DECK_OPS`, `DECK_COMMAND_RESULT`, `readDeckCommandResult`, `checkDeckOps`, `applyDeckOps`, `deckChanges`, `DECK_COMMAND_SYSTEM`, `deckCommandUserMessage` |
| `domain/lesson-planner/deck-command.server.ts` (new) | `runDeckCommand` |
| `routes/api.domain.lesson-planner.deck-command/route.ts` (new) | Access, flags, ownership, the call |
| `routes/api.domain.lesson-planner/build-system-prompt.ts` | Export the kit section |
| `routes/app.lesson-planner_.$conversationId.deck.$deckId/deck-chat.tsx` (new) | The panel: lines, change list, Undo, "pointing at", suggestions |
| `deck-studio.tsx` | Selection state from the focused run; the panel beside the slide |
| flag files | `lesson_planner_deck_chat` |

### 5.5 Tests (written first)

- `deck-command.test.ts`: each operation; numbering against the sent deck
  when slides are added and removed in one answer; every check above;
  lenient reading of the model's JSON; the change list.
- `deck-command.server.test.ts`: `getLLMCompletion` mocked; a good answer, an
  unreadable one, an invalid deck, the rate limit.
- `route.test.ts`: flags off 404; someone else's lesson 404; body limits.
- `teacher.lesson-planner-deck-studio.spec.ts`: the request intercepted in
  the browser (the existing pattern): ask, see the slides and the change
  list change, Undo, point at one part and ask, save.

### 5.6 Done when

A teacher can ask for a change to the whole deck or to one part, see what
changed, undo it, and save. Not checked by automated tests: how good the
model's edits are. That needs a pass on a preview with real decks before the
flag goes on for a school.

## 6. Phase 3: nothing is lost

- **`LessonPlanDeckRevision`** (new table): `id`, `conversationId`,
  `materialId`, `createdAt`, `by` (`teacher`, `yawp`, `planner`, `upload`),
  `summary`, `content`, `request?` (the line asked), `changes Json?`.
  Additive migration with `lock_timeout` and a `rollback.sql`.
- **Autosave** replaces the Save button: a debounced save with the revision
  it was based on, refused if another tab saved first. `LessonPlanMaterial`
  keeps the current deck on every save, so every reader stays as it is
  (dual write).
- **Undo and history** across reloads: the last 50 revisions per deck,
  "Back to this version".
- **The chat is kept with the deck** (in revisions, not in
  `LessonPlanMessage`), so it is there when the teacher comes back.
- **`editedAt`**: a Yawp! edit in the studio counts as the teacher's, since
  they asked for it there. The planner still asks before replacing it.
- **Agenda minutes**: stop saving the stack's minutes into the deck (the
  loader syncs them for display; the editor saves what it was given).

## 7. Phase 4: an uploaded deck, kept as it is

### 7.1 A test before any build

Render 20 real decks (Brian's first) with headless LibreOffice and compare
each slide to PowerPoint's own export. Record what breaks: fonts, SmartArt,
charts, embedded video, slide size. The result decides whether "kept as you
made it" can be promised for every deck or needs a "this slide may look
different" note. Without that test the rest of this phase is a guess.

### 7.2 Pieces

- **Render service.** A second App Runner service (or a container Lambda)
  with LibreOffice and open fonts that match the common ones (Carlito for
  Calibri, Caladea for Cambria, Liberation, Noto, the Google Fonts that
  Google Slides exports name). One internal endpoint: a .pptx in, one PNG
  per slide out, signed with the existing internal token. New Terraform: an
  ECR repository, the service, its role. This cannot be tested from a
  preview; previews and end-to-end tests use a stub that draws a labelled
  placeholder per slide.
- **Storage.** Slide images in S3 under `lesson-decks/<uploadId>/<n>.png`,
  following the assignment prompt pattern: written by the server, read
  through an access-checked route that redirects to a 5-minute signed URL.
  A local-disk store for previews, tests and local dev. The bucket policy
  gains `s3:DeleteObject` (it lacks it today) and deleting an upload deletes
  its images, which the 30-day deletion promise needs.
- **A job, without a queue.** `LessonPlanDeckRender` rows
  (`uploadId`, `status`, `slideCount`, `error`). The upload request starts
  the render and returns; the page polls. A render that outlives its request
  is picked up by the next poll. No new infrastructure beyond the service.
- **Data.** An "own deck" is the upload itself: `LessonPlanUpload` gains
  `slideCount` and `renderedAt`. The lesson's deck slot points at it with a
  small stored block (`{"own": "<uploadId>", "title", "slides": […]}`)
  whose `slides` carry each slide's words, notes, minutes and step, so the
  planner, the stack, freshness and Run the show keep working. Every reader of a
  deck learns the one new shape through `loadLessonDeck` and `lessonDeck`.
- **Using it.** Present shows the images, with the teacher's notes. "Use my
  slides 3 to 5 for the opening" sets `step` on those slides; the plan and
  handouts already name uploaded slides by number. Download returns the
  original. The slides PDF and share pages draw the images.
- **The choice card** keeps both answers: "Keep it as is" now means this;
  "Rework it" still makes a Yawp! deck.

### 7.3 Done when

Brian's deck, uploaded, shows slide for slide as he made it, can be
presented, has slides 3 to 5 assigned to a step from chat, and downloads
byte for byte.

## 8. Phase 5: edit an uploaded deck

- **Read the shapes.** A second reader beside `readPptxDeck`: per slide,
  each text shape's id, position and size (its own `a:xfrm`, else its
  placeholder's from the layout, else the master's), paragraphs and runs.
  This inheritance is the hard part and is where the estimate is weakest.
- **Edit by patching.** A text edit replaces the runs of one paragraph in
  one shape, keeping the first run's formatting, with `jszip`, as
  `pptx-embed-font.server.ts` does. The patched file is a new revision; the
  original upload is kept untouched. Only the changed slide is drawn again.
- **On the slide.** Click a text box on the image; a text field opens over
  it at the shape's position; on leaving it the slide redraws (a second or
  two). It is not live typing in the teacher's font, and the plan should not
  promise that it is.
- **By chat.** The same route as phase 2 with a second operation set:
  `set_shape_text`, `remove_slide`, `move_slide`, `duplicate_slide`. Adding a
  new slide in the teacher's design means duplicating one of theirs and
  changing its words.
- **Not editable:** text inside pictures, SmartArt, charts and grouped
  drawings. Those slides show as they are and say so.

## 9. Phase 6: Library, fields, and retiring the form

- A deck in the Lesson Library in its own right needs a decision first: a
  deck-only lesson (works today, one table fewer) or a `LessonDeck` table.
  Recommended: a deck-only lesson with a "Slide deck" kind in the Library
  list, until a deck needs to be used in more than one lesson.
- Field cleanup once the studio is the only editor: `accentWord`,
  `timeline[].mark` and `deck.subtitle` are never drawn in v4; the editor
  allows 4 tasks where 3 are drawn; `DECK_ACCENTS` still names ember (v4
  already draws it as maroon). Remove what nothing draws, with a migration
  of stored decks that drops the keys.
- Remove the old editor and the tile on-slide path after two weeks of the
  studio in production with no regressions.

## 10. Order, size, and what each pull request holds

| PR | Holds | Rough size | Depends on |
| --- | --- | --- | --- |
| 1 | Phases 1 and 2, both flags off | 4 to 6 days | Brock turning on v4.1 to be seen by a school |
| 2 | Phase 3 | 4 to 5 days | PR 1 in production |
| 3 | The render test (7.1), written up | 2 days | Brian's deck and 19 others |
| 4 | Phase 4 | 8 to 12 days, including Terraform | PR 3's result; someone with AWS access |
| 5 | Phase 5 | 8 to 12 days | PR 4 |
| 6 | Phase 6 | 3 to 4 days | Two weeks of PR 1 in production |

Sizes are estimates for one person. Phases 4 and 5 carry the most doubt:
the render test and shape inheritance can each move them by a week.

## 11. Risks

| Risk | What we do |
| --- | --- |
| Typing makes the caret jump when the layout re-flows or the type size steps down | The editable run never has its text replaced while focused; only its style changes. Covered in the end-to-end test with a title typed past the size step. |
| A source on a run writes the wrong field | The layout test reads every sourced run back to its field for every template, v4 and v4.1. |
| Adding sources changes a printed slide | Run texts and order are unchanged; a test pins them. |
| The model returns a deck that breaks the rules | Nothing is applied unless the result validates; the teacher's deck is untouched. |
| Chat edits cost more than expected | Whole-slide answers are small (a deck is a few thousand tokens). The shared hourly limit applies. Usage is logged under its own feature name, so it can be read after a week. |
| LibreOffice draws a teacher's deck wrong | Tested before the build (7.1). The original always downloads. |
| A second service is new ground for this repo | Kept to one stateless endpoint; previews use a stub. |

## 12. Open questions

1. Brian: is "edit your own deck in PowerPoint and upload it again" acceptable
   for the first release of phase 4, with on-slide editing of uploads
   following in phase 5?
2. Brian: in the studio, should "More options" exist at all once every drawn
   word is editable, or only until the old editor is retired?
3. Kevin: App Runner or Lambda for the render service, and who applies the
   Terraform?
4. Kevin: is the shared 40-an-hour planner limit right for deck chat, or
   does it need its own?

## 13. Not in this plan

- The exit ticket cards in the chat (three squeezed columns, "Main points of
  the lesson" one letter per line). Likely cause:
  `components/ai-chat/exit-ticket-card.tsx`, the `shrink-0` label in a flex
  row. A separate fix.
- Turning on `lesson_planner_deck_kit_v41` for schools (Brock's list).
- Google Slides import or export.
