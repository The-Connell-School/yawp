# Lesson Planner: what we built from Brian's third run and the stack page redesign

Plan: [`2026-10-19-lesson-planner-brian-run-3.md`](./2026-10-19-lesson-planner-brian-run-3.md).
Built on `claude/gracious-wozniak-s6ps88`, which is PR 437's head with `main`
merged in. One commit per change, with the plan's default answer taken for
every open decision (K1–K10).

## In one paragraph

The stack is right now. Times come from each step, never from a step's
first sentence, so the hook keeps its 15 minutes and the header adds up to
50. Every step has a time, the Closing card holds only the closing, and
Daily Pages has a short real title. In the chat, every step has its own Add
to stack on its heading. Its status matches its card and the summary list,
and it stays in step with the stack page and other tabs. A full lesson
opens with Brian's line, and "Create in YAWP!" is on every writing step,
reading "Created in YAWP! · Open" once it is done. Behind a new flag, the
stack page becomes the run of show from Kevin's brief:
- a time bar against the period, with at most two one-tap fixes when it
  runs long, and never on writing
- a writing meter
- compact run-of-show cards with a minutes stepper
- adding a piece right where the teacher points
- a one-line stack chat with Undo
- a finish line, and Take it to class

Further flags add handouts for any step, written for students; posting and
sending the lesson; Run the show; and templates.

## How to turn it on

| Flag | What it turns on | Needs |
| --- | --- | --- |
| `lesson_planner_stack_v2` (wave 1) | The chat-side changes: Add to stack on every step, one status everywhere, the framing line, Create in YAWP! on every writing step, suggested times | none |
| `lesson_planner_stack_v3` (new) | The run-of-show stack page, the Add a piece panel, the stack chat, fixes, the writing meter, the finish line, Take it to class, handouts for any step | stack v2 |
| `lesson_planner_share` (new) | Post to your class, Send this lesson | stack v3 |
| `lesson_planner_run_show` (new) | Run the show | stack v3 |
| `lesson_planner_templates` (new) | Save this shape as a template, Build from my templates | stack v3 |
| `lesson_planner_plan_export_v2` (wave 2) | The lesson plan changes (one Closing, real headings, blank sections) | none |

All are off in production and on in PR previews; the preview seed creates
the four new rows. With stack v3 off, the stack page is exactly the stack v2
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
4. **Create in YAWP! on every writing step.** This covers class starters,
   Daily Pages, exit tickets (including one written as prose in a Closing
   step), quick writes, and Thesis Essay modules (the thesis statement
   type). Creating from a stack piece is remembered through an optional
   `onCreated` on the shared assignment sheet, and the button becomes
   "Created in YAWP! · Open" on the stack and on the chat card.
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
    pair-share question and its landing line. The new brand is not
    applied (see below).

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
- **Writing time.** A step is writing when its kind is a YAWP! writing
  assignment (class starter, Daily Pages, exit ticket, Thesis Essay
  module) or one was created from it. The teacher never sets it. Writing %
  is writing minutes over the period, or over the total when the total is
  longer.
- **Data.**
  - The deck is no longer a step.
  - The duration is the sum of the steps.
  - Steps have type, minutes, label, handout state, a student version
    and the YAWP! assignment made from them.
  - Lessons have set and date timestamps.
  - New tables: templates, carry-over, stack chat turns and share links.
  - Six additive, nullable migrations, each with a rollback.

## Decisions taken with the default

- **K1.** Finish line and Take it to class replace "When the sequence is
  set" on the new page only, and the old page keeps it.
- **K2.** "Back to planning", with "Your chat, with this stack saved" on
  hover.
- **K3.** Google Docs is the Word file plus a guided upload, with no
  Drive sign-in.
- **K4.** The deck brand is waiting for the values (below).
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
- **"Created in YAWP!" is remembered for pieces in the stack.** A card in
  the chat whose piece was never added has no stack row to remember it
  on.
- **No class starter picker.** Since wave 2 each prompt is its own piece
  with its own Create, so no "pick one of three" dialog was built.
- **The sub's class roster is shown but turned off**, with "Coming once
  lessons are tied to your class list" (K6).
- **No "your stack changed since this deck" notice yet.** Rebuild is on
  the deck row.
- **The brand of the slides is unchanged.** Brian's deck brand link has
  not reached this session (the PDF covers the stack page).

## Still for Kevin and Brian

- **The deck brand.** Paste the colors, fonts and footer from Brian's
  Claude Design link, or share it from this account, and it goes into
  the deck theme.
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
- **The earlier specs and typecheck.** All planner e2e suites run
  together (results below), with the original planner spec run with
  every flag off. Every planner unit test file passes on its own, and
  typecheck is clean.
- **Checked by eye:** the stack page at desktop and phone width against
  the boards, the Add panel, Run the show, the template start screen, and
  the right column (finish line, Take it to class, Post, Send).
- **CI** runs the run-3 spec in smoke and the new unit files.
