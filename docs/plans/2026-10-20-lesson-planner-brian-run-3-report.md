# Lesson Planner: what we built from Brian's third run and the stack page redesign

Plan: [`2026-10-19-lesson-planner-brian-run-3.md`](./2026-10-19-lesson-planner-brian-run-3.md).
Built on `claude/gracious-wozniak-s6ps88` and pushed to PR 437's branch,
with `main` merged in (including its Yawp! brand sweep, which the planner's
new strings now follow: "Create in Yawp!", "Created in Yawp! · Open"). One commit per change, with the plan's default answer taken for
every open decision (K1–K10).

## In one paragraph

The stack is right now. Times come from each step, never from a step's
first sentence, so the hook keeps its 15 minutes and the header adds up to
50. Every step has a time, the Closing card holds only the closing, and
Daily Pages has a short real title. In the chat, every step has its own Add
to stack on its heading. Its status matches its card and the summary list,
and it stays in step with the stack page and other tabs. A full lesson
opens with Brian's line, and "Create in Yawp!" is on every writing step,
reading "Created in Yawp! · Open" once it is done. Behind a new flag, the
stack page becomes the run of show from Kevin's brief:
- a time bar against the period, with at most two one-tap fixes when it
  runs long, and never on writing
- a writing meter
- compact run-of-show cards with a minutes stepper
- adding a piece right where the teacher points
- a one-line stack chat with Undo
- a finish line, and Take it to class

Further flags add handouts for any step, written for students; posting and
sending the lesson; Run the show; templates; and the gallery deck from
Brian's Lesson Deck Kit.

## How to turn it on

| Flag | What it turns on | Needs |
| --- | --- | --- |
| `lesson_planner_stack_v2` (wave 1) | The chat-side changes: Add to stack on every step, one status everywhere, the framing line, Create in Yawp! on every writing step, suggested times | none |
| `lesson_planner_stack_v3` (new) | The run-of-show stack page, the Add a piece panel, the stack chat, fixes, the writing meter, the finish line, Take it to class, handouts for any step | stack v2 |
| `lesson_planner_share` (new) | Post to your class, Send this lesson | stack v3 |
| `lesson_planner_run_show` (new) | Run the show | stack v3 |
| `lesson_planner_templates` (new) | Save this shape as a template, Build from my templates | stack v3 |
| `lesson_planner_plan_export_v2` (wave 2) | The lesson plan changes (one Closing, real headings, blank sections) | none |
| `lesson_planner_deck_gallery` (new) | The Lesson Deck Kit look in Present, Run the show, the deck editor and PowerPoint, and the planner's gallery templates | deck v2 |

All are off in production and on in PR previews; the preview seed creates
the five new rows. With stack v3 off, the stack page is exactly the stack v2
page, with the Phase 0 fixes. The prompt changes apply to everyone, as in
the earlier waves (prompt version `2026-10-19-run-3-v1`).

## What changed, by Brian's item

1. **Add to stack on every segment.** Each step's heading in the reply
   carries its own toggle. A step that is only its blocks (Class starter
   over the prompt, Framing over three notes) files as those blocks, so
   adding from the heading, the card or the list is the same add.
2. **One status everywhere, two-way sync.** The chat re-reads the stack
   on focus, after every change it makes, and when another tab changes it.
   That covers the stack page, the side panel and a second planner tab.
   Add everything files only what is missing.
3. **Opening copy.** "Here's a full lesson. You don't have to use all of
   it…" sits above every full lesson. A model preamble ("I have
   everything I need. Here's the plan.") is dropped, and the prompt now
   says so too.
4. **Create in Yawp! on every writing step.** This covers class starters,
   Daily Pages, exit tickets (including one written as prose in a Closing
   step), quick writes, and Thesis Essay modules (the thesis statement
   type). Creating from a stack piece is remembered through an optional
   `onCreated` on the shared assignment sheet, and the button becomes
   "Created in Yawp! · Open" on the stack and on the chat card.
5. **Stack cards hold only the step.** The last step no longer runs to
   the end of the reply: a `---`, "Total: …", the "You don't have to use
   all of these" line and a closing question to the teacher are cut.
   Steps filed before this change are shown without them too.
6. **Running total from the stack.** The header, the time bar and every
   total read from the steps' own minutes.
7. **Chat on the stack page.** "Ask the planner" in the Add panel is the
   stack chat (Decision K10). "Shorten the hook to 10 minutes" changes
   the card and the total and answers in one line with Undo, with no
   model call for minute changes and removals. Anything else is one small
   structured call. It never cuts or shortens a writing step unless the
   teacher names it. A question or a bigger rethink is sent back to the
   planner. Both lines are kept in the lesson's conversation and show in
   the planner chat as one compact "Stack change" line. "Back to
   planning" says "Your chat, with this stack saved" on hover.
8. **Handouts for any step.** Every step is listed, and what students
   already hold is in by default. A teacher step is rewritten for
   students once, with no teacher moves, cached on the step by its
   content. Writing steps get answer lines sized to their minutes. Each
   step downloads alone. The absent-student link is gone from the handout
   panel; on the new page it is the Student tab of Send this lesson.
9. **A time for every step.** The fix for the wrong hook time is above.
   Framing notes and Daily Pages carry their own `minutes:`, and a step
   with no time shows its type's suggested time (marked ~ in the old
   outline, grey on the new page).
10. **Running long.** At most two fixes, each with Apply and Undo:
    - trim the longest non-writing step, never below 3 minutes, and say
      what it reaches
    - move a Context step to tomorrow, where it waits at the top of that
      class's next lesson

    Neither fix ever touches writing, and the box says so.
11. **Short real titles.** The planner writes a `title:` line, and
    otherwise the title is the prompt's first clause, ended at a word.
12. **Lesson plan.** The stack decides the sections: a closing or exit
    ticket in the stack is the Closing section and is never listed
    twice. If there is none, it says "Suggested closing: not in your
    stack." Step titles are real Heading 3s. New blank sections are
    Standards, Differentiation / accommodations, and Assessment (filled
    from the exit ticket or Daily Pages). Goals reads "Learning
    objectives". The new page offers Word, Google Docs (the Word file plus
    the Google Docs upload steps) and PDF.
13. **Wherever the teacher starts.** The prompt tells the planner never
    to ask again for what the teacher said, and to ask only for what is
    missing. A short first-open line sits on the new stack page.
14. **Deck.** It is built from the stack, one slide per step marked with
    the step's number, and the hook slide carries its directions, its
    pair-share question and its landing line. Behind its own flag, the
    deck wears Brian's Lesson Deck Kit (next section).

## What changed, from Kevin's redesign brief

- **Stack page.** Its own look: page `#F6F1EA`, cards `#FFFDF9`, Bricolage
  Grotesque and Instrument Sans loaded on this page only, the seven type
  colors, and purple only for writing. It has the header, the time bar,
  fixes, the writing strip, the run of show with start minutes,
  insert-anywhere "+", the finish line and Take it to class, laid out as
  on the boards. It also works at phone width.
- **Add a piece panel.** Where the piece goes, the time right now, two
  tabs, cards with their impact ("+5 min · puts you 5 over · writing to
  27%"), and drag into "Drop here" slots. After an add, the insert point
  moves past the new piece. It ends with "Continue in the planner →".
- **Run the show** is at `/show/:id`. It has:
  - a rail of steps, the Now card with the step's notes and the slide
    on the projector, Up next, Back and Next
  - a clock that is Off by default, plus Stopwatch and Countdown;
    overtime is amber and calm, and the heads-up is on the teacher's
    screen only
  - Next moves a Present window on the same computer, and the show says
    "Slides on the projector · following you"
  - "That's the show." at the end
- **Templates.** "Build from my templates" is the second start tile.
  Each template shows its shape, its length, a time bar with the writing
  line and its writing share. Picking one shows the chip and the "What are
  we reading?" placeholder, and the planner keeps the shape.
- **Writing time.** A step is writing when its kind is a Yawp! writing
  assignment (class starter, Daily Pages, exit ticket, Thesis Essay
  module) or one was created from it. The teacher never sets it. Writing %
  is writing minutes over the period, or over the total when the total is
  longer.
- **Data.**
  - The deck is no longer a step.
  - The duration is the sum of the steps.
  - Steps have type, minutes, label, handout state, a student version
    and the Yawp! assignment made from them.
  - Lessons have set and date timestamps.
  - New tables: templates, carry-over, stack chat turns and share links.
  - Six additive, nullable migrations, each with a rollback.

## The gallery deck, from the Lesson Deck Kit

Behind `lesson_planner_deck_gallery` (needs deck v2), decks follow "The
gallery and the page" spec:
- **Look.** Paper `#F3F0E8`, pine `#1F3532` for writing, ink for looking,
  one accent per unit (ember by default; indigo, olive, plum), Cormorant
  Garamond over Libre Franklin. A 1280×720 canvas with 80px margins,
  left-aligned, no boxes, shadows or slide numbers. A small running head
  (the art's swatch, the unit and the lesson in caps, over a hairline).
- **Twelve templates.** Each has its italic mode word: title; agenda
  "Today."; steps "Do."; discuss "Talk."; big idea "Hold this." with an
  art strip; write "Write." on pine; notes "Know." as a timeline or
  facts; divider "Part ii." beside the art; read along "Read." with verb
  tasks; look "Look." on ink with the painting; excerpt "Annotate." on a
  sheet; exit "Before you go." on the accent wall. Prompts are set at
  80, 64 or 54px by word count.
- **Rhythm, enforced by the renderer.** A dark slide only when none of
  the three before it was (so never two in a row, at most one in four),
  one accent wall (the last exit), and art only when the deck hangs a
  work. A slide that loses its ground is drawn on paper; its words never
  change.
- **Art.** One work per lesson from a small library, never under text,
  always credited. It holds Turner's *The Fighting Temeraire* (public
  domain, taken from the kit) for now.
- **Where.** Present, Run the show, the deck editor (which edits the new
  slots) and the PowerPoint download. PowerPoint uses the kit's
  fallbacks: Georgia set 8% smaller, and Franklin Gothic Book, with the
  painting embedded.
- **The planner** learns the templates, their slots, the rhythm, one
  accent per unit and the art library, only with the flag on. This sits
  after the cache breakpoint, so the cached prompt is unchanged. Deck
  repair keeps a gallery deck's layouts.
- **Flag off.** Nothing changes. A gallery slide in a deck is drawn as
  its nearest tile slide (an agenda as notes with minutes, an exit as the
  closing, and so on), so a deck made with the flag on still shows
  everywhere.

## Kevin's notes from testing (Oct 21)

- **No AI sparkle.** It is gone from the Create buttons on class starter,
  Daily Pages, exit ticket and practice cards.
- **Options side by side.** Brian asked for three class starters and
  three exit tickets, each with its own buttons, but did not ask for a
  vertical list. Two or more options of one kind in a row now sit in one
  horizontal row with arrows and "1 of 3", each card keeping its Add and
  Create. The same applies to framing cards and practice.
- **Pages scroll.** The run-of-show stack page and the step handouts page
  could not be scrolled at all: the app frame has a fixed height, and
  these pages did not scroll themselves. They do now, and an e2e test
  scrolls with the mouse wheel (it fails on the old layout).
- **Clearer plan steps.** In the chat, each step of a proposed lesson is
  its own section: a number, a real heading, its minutes in a chip, and a
  divider above it.
- **Stack order and time.** Pieces added one by one from the same reply
  now read in the reply's order, not the order they were clicked. A card
  that is the only one under its step brings the step's minutes (lecture
  notes under "Mini-lecture (12 min)" are 12, not a guessed 5). The first
  run-of-show card says "Start" instead of "00 min in", which read as a
  step with no time. Rows filed before this keep their order.

## Decisions taken with the default

- **K1.** Finish line and Take it to class replace "When the sequence is
  set" on the new page only, and the old page keeps it.
- **K2.** "Back to planning", with "Your chat, with this stack saved" on
  hover.
- **K3.** Google Docs is the Word file plus a guided upload, with no
  Drive sign-in.
- **K4.** The deck brand is Brian's Lesson Deck Kit, behind its own flag.
- **K5.** Writing is decided by kind, before the assignment is created.
- **K6.** "Tomorrow" is the next lesson started for the same class
  label.
- **K7.** Unadded suggestions are read from the conversation, not
  stored.
- **K8.** A set lesson can still be edited; Keep editing un-sets it.
- **K9.** The stack chat uses the planner's model, with a no-model path
  for minutes and removals.
- **K10.** One input: Ask the planner in the panel, also opened from
  "Ask the planner" beside Run of show.

## Where the build differs from the plan

- **Run the show is at `/show/:id`**, not under `/app/lesson-planner`:
  like Present, it gets a full screen without the app's navigation.
- **A step moved to tomorrow is claimed when the next lesson's stack page
  opens**, not when its chat starts. It shows there at the top, labeled
  "Moved from Mon, Oct 19".
- **The first-open line is remembered per browser**, not per teacher
  account.
- **"Created in Yawp!" is remembered for pieces in the stack.** A card in
  the chat whose piece was never added has no stack row to remember it
  on.
- **No class starter picker.** Since wave 2 each prompt is its own piece
  with its own Create, so no "pick one of three" dialog was built.
- **The sub's class roster is shown but turned off**, with "Coming once
  lessons are tied to your class list" (K6).
- **No "your stack changed since this deck" notice yet.** Rebuild is on
  the deck row.
- **The gallery deck's art library holds one painting.** The kit names
  a shortlist; only Turner's came with the kit, and image hosts are
  blocked from the build. Each further work is one image plus one entry
  in `deck-art.ts`.

- **Slides for a lecture.** A deck built from the stack gave a lecture
  one slide, however many parts it taught. A lecture or mini-lesson on the
  run of show now offers **Build slides for this lecture**. The planner
  builds (or rebuilds) the lesson's one deck with a slide for each part,
  all marked with that step, so Run the show still finds them.
- **Before class: what is not in Yawp! yet.** A teacher can choose paper
  over a Yawp! assignment, but should never reach class thinking an exit
  ticket exists when it was never made. Each writing step whose
  assignment is not made carries a "Not in Yawp! yet" tag on its card. The
  finish line lists them ("Exit ticket", "Class starter", "Daily Pages"),
  each with Create and Paper instead. A made one leaves the list on its
  own. Paper instead is remembered in that browser only.

## The Lesson Deck Kit v3, the lesson plan spec and handouts (Oct 21)

Brian's notes, organized, the decisions and the plan are in
[`2026-10-21-lesson-deck-kit-v3.md`](./2026-10-21-lesson-deck-kit-v3.md).
It all sits behind the same flag, `lesson_planner_deck_gallery`, now
named "Lesson Planner: Lesson Deck Kit". With it off, nothing changes.

- **Decks follow spec v3.** Georgia and Arial only (Gelasio and Arimo
  stand in on machines without them). Each deck takes two or three colors
  from its painting, darkened until they read on paper. Mode words appear
  only where they do a job: *Today's program* replaces the agenda's
  headline, *Know this.* and *Before you go.* close the right slides, and a
  word that repeats the headline or the slide before it is dropped.
  Dividers name the writing-process step (*Step 5.*). Quizzes mark the
  right answer with a soft color band. Running heads carry no lesson or
  day numbers, there is one accent wall at most, the painting is shown
  large three times at most, and there is no transparency. Present, Run
  the show and the PowerPoint draw the same deck.
- **The planner writes to the kit.** Its gallery instructions were
  replaced with spec v3: the twelve templates with their limits, the
  mode-word rules, the painting's colors, `~~1|…~~` color coding,
  writing-process dividers, quiz answers and the Yawp! button. Every deck,
  gallery or not, now follows the kit's writing rules: no lesson or day
  numbers, no filler, never give the answer away, current MLA, and sized
  to the space. Deck repair keeps the new fields.
- **The lesson plan follows the lesson plan spec v1** (with plan export
  v2 on). This covers:
  - Kicker, title and subtitle taken from the deck, in the painting's
    primary color.
  - The Step, Slide deck and Platform lines.
  - The Overview callout, a Goals table, and an empty Standards box.
  - Materials that always name the deck and yawp.school.
  - Phases, and steps numbered straight through with short titles. Each
    step has a SLIDES line that names the deck's slides for it.
  - The footer "Yawp! Writing Program | … lesson plan | Page N".

  The Word file uses built-in headings, real numbering, a page field,
  fixed twip tables and clear shading, on US Letter with 0.75-inch
  margins. The PDF is the same plan, with Gelasio and Arimo embedded.
- **Handouts** (the student handout and step handouts) use the plan's
  fonts and the lesson's color.
- **Checked:**
  - Unit tests for the colors, the mode rules, the renderers, the plan
    model and both plan files, plus the prompt.
  - E2E tests for the deck in Present and PowerPoint, and for the plan
    download and handouts.
  - All planner e2e suites and typecheck.
  - The PowerPoint, the Word file and the PDF were rendered and compared
    with the kit's pages.

## Sharing, standards and your own documents (Oct 21 review)

Plan and status: [`2026-10-21-sharing-standards-uploads.md`](./2026-10-21-sharing-standards-uploads.md).

- **Post to your class** leads with **Copy link**, to paste into Google
  Classroom, Canvas, Schoology or anywhere. The Canvas and Schoology
  buttons that only copied the link are gone. Google Classroom and Teams
  are offered as their own share pages, with the note that they may ask
  which account to use and that Yawp! is not connected to them.
- **Family:** "What we did and why", plus two or three ways to talk about
  it at dinner.
- **Admin:**
  - The standards the teacher named in the planner (codes such as
    RL.9-10.1, or text they gave as a standard), never inferred. With none
    named, the option is off and says how to add one.
  - **Invite them to observe** adds an invitation with the class and day.
- **Slide numbers** are off the slide face in every template (Present, Run
  the show, the editor and PowerPoint). The presenter's own counter stays.
- **Standards in the plan.** A standard the teacher names shapes the lesson:
  the objective, a step that does its work, and a check that measures it.
  The plan's Standards section lists the ones they named, with room for
  more. "See which Common Core standards are present in this lesson" is not
  built. It needs the Common Core ELA 7–12 text and the comparison in the
  plan first, and the wording stays Common Core, not state standards.
- **Leaner by default:** the timed steps and only the material a lesson
  cannot run without; the rest is offered.
- **Sticky-note checks** are checks for understanding, never exit tickets.
- **Unit maps:**
  - Each day says what students read and whether in class or at home, on
    the board, in print and when the day is built.
  - A cell a little too long is trimmed instead of losing the whole map
    (the likely "glitch").
- **Your own documents** (flag `lesson_planner_uploads`): a paperclip in the
  planner adds PDF, Word, PowerPoint, text or Markdown, up to 10 MB and 10
  per lesson. Only the text is kept. The planner builds from them, quotes
  them, says which one a step uses, and reads long ones a part at a time.

## Still for Kevin and Brian

- **More art for the gallery deck.** The kit's reference table names
  seven more works (Hopper, Klee, Degas, Mondrian and others). Museum sites
  are blocked from the build machine, so send their images and they go
  into the library with their colors.
- **Standards experiment.** Load Common Core ELA 7–12 and compare a
  detailed lesson with a pared-down one before offering "See which Common
  Core standards are present". State standards wait for onboarding.
- **Try uploads on the preview** with a real chapter and handout: the model
  path cannot run in e2e.
- **For Brian:** the kit writes the brand as "YAWP!" in mixed case, while
  the app writes "Yawp!" (the Oct 20 sweep). The plan footer and the exit
  button follow the app for now. The kit's artifact link and its
  `lesson-plan/` folder could not be opened from here, so the plan was
  built from the PDF's spec and data model.
- **A look at the gallery deck on the preview**, against the kit, with a
  real planner-made deck.
- **Phone as a remote for Run the show.** It needs a server channel and
  a pairing code (not mocked).
- **Real Google Doc creation and Classroom posting.** These need Google
  sign-in and consent.
- **Tying lessons to a real class.** This is a better "tomorrow" key,
  and the sub roster and weekly writing totals need it.
- **The stack chat's answers on real lessons.** E2E covers the no-model
  path; the model path needs a look on the preview.
- **The student versions of teacher steps.** Brian should read a few
  (hook, framing sheet, exit slip) for tone.

## How it was checked

- **Tests first throughout**, with unit tests for every new domain module:
  step types, timing and fixes, short titles, fileable pieces, framing,
  suggestions, stack command, stack steps, stack actions, step handouts,
  share and share links, run the show, templates. Unit tests also cover
  the new stack API route (snapshot Undo, fixes recomputed on the server,
  share flag and limits) and the prompt.
- **A new e2e spec**, `e2e/tests/teacher.lesson-planner-run-3.spec.ts`,
  with each flag on and off where it matters. It covers:
  - Phase 0 times and cards
  - the chat toggles, sync, framing, and Create → Created
  - the run-of-show page: bar, stepper, fixes and Undo, tomorrow and the
    next lesson, add in place, stack chat and Undo, set and keep editing,
    deck not a step
  - handouts, post and send (a link opens with no login, and a made-up
    link opens nothing)
  - Run the show: steps, the countdown with a fake clock, and the
    projector following
  - templates
- **The earlier specs and typecheck.** All planner e2e suites pass
  together: 139 tests in 10.8 minutes across the original planner spec
  (every flag off), the exit ticket spec, the wave 1 review spec, the
  run 2 spec and the run 3 spec (26 tests). Every planner unit test file passes on its own, and
  typecheck is clean.
- **Checked by eye:** the stack page at desktop and phone width against
  the boards, the Add panel, Run the show, the template start screen, and
  the right column (finish line, Take it to class, Post, Send).
- **CI** runs the run-3 spec in smoke and the new unit files.
