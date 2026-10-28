# Brian's round 4 notes (Oct 28): plan

Brian says PR 723 is ready for the demo site, and he wants to send it to a teacher at Cristo Rey Birmingham for feedback. He sent five notes. Three of them he has given before.

His notes, in full:

> - The single lesson view within a unit is still a different design than what's on our Claude design page (attached).
> - After I build the slide deck in the stack page and I click "Add it," it opens the sidebar chat and gives me the option of adding it in that chat instead of just automatically adding the slide deck. This is an unnecessary screen change and step - it should just automatically add it.
> - Also, when I build the slide deck in the stack in the chat sidebar, once it's built, it doesn't give me the option to edit. It only gives me the option to present or add, and we need to let them edit.
> - When I click Lesson is Set!, there are no sparkles. I actually think it would be hilarious to do a burst of confetti and then almost a cascading YAWP. Maybe not like 100 YAWP logos filling the screen like we see on a text message, but maybe just a single, celebratory YAWP logo, just sort of emerging through the confetti. What would be even funnier is if we could do a little voiceover: when the teacher hits "Lesson is set," it's like confetti with the emerging YAWP logo, and then just a guy saying "Yaaaawp!"
> - The link for the student to view the lesson looks better. It identified both the class starter and the daily pages in the assignment that I created, but it did not identify the exit ticket as in a little purple box like the other two. It only put the exit ticket down below as a handout.

The design he attached is the L2 unit view ("The Great Gatsby", Day 7 of 20).

Each item gets its tests first (e2e for the UI, unit tests for helpers), then the fix, then its own commit. No new flags and no migration: everything sits under flags that are already on in previews (`lesson_planner_library_v2`, `lesson_planner_teach_notes`, `lesson_planner_deck_v2`), except the share-page fix, which is a bug fix for everyone.

## 1. The lesson in the unit view matches the design

**Problem:** the unit page (`app.lesson-planner_.library_.unit.$unitId/route.tsx`) has the right parts but not the design's look. The design, piece by piece, against what ships:

| Piece | Design | Now |
|---|---|---|
| Breadcrumb | "Library" in coral, then "/ The Great Gatsby" | Both muted |
| Kind | A small colored dot, then "Reading · Novel" | A boxed icon |
| Header buttons | Pill buttons: "Add an existing lesson" outlined, "Plan another lesson" filled coral | Square buttons |
| Left column | One card: "Unit at a glance", then Contents | Two cards |
| At a glance | "Lessons" and "Writing" side by side, with labels over big numbers ("20 · 2 drafts", "571 min · 57%" in purple) | One line each, small, with an uppercase heading |
| Day bars | In a lavender box headed "Writing minutes, day by day" | Bare bars |
| Contents rows | "Day 7" small and bold, the title wrapping to two lines; the chosen row on beige; "Draft" in coral | Titles cut off with "…"; "Draft" muted |
| Contents footer | "Hover between two days and click + to add a lesson right there." | None |
| Day tabs | Folder tabs on top of the lesson card: the chosen tab is white and joins the card, the others are beige | Black chip for the chosen day, separate from the card |
| Lesson heading | "Day 7 of 20 · Tue, Nov 10" in sentence case | Uppercase, letter-spaced |
| Status | A small grey "Set" chip | A dark badge |
| Time bar | Segments in each step's color at full strength, with gaps, and a purple line under the writing steps | Writing steps purple, the rest faded |
| Run of show | Rows in a bordered, rounded box | Bare dividers |
| Footer | "Rework in the planner" as an outlined pill, "Duplicate" as a text button, and "Move to another unit…" as a large select on the right | Small ghost buttons and a small select |

**One deliberate difference:** the design's single "Open the run of show" button. Brian's round 3 (1.11) replaced it with **Open slide deck** and **Open the stack**, and his round 4 note doesn't take that back. Both buttons stay, in the design's spot and style: Open the stack is the coral pill, and Open slide deck is outlined beside it. Rename stays too, as a text button in the footer.

**Fix:** restyle the route to the design. Behavior, test ids and data don't change, except:
- the "Unit at a glance" numbers read "2 · 1 draft" under "Lessons" and "20 min · 20%" under "Writing" (`unit-glance-lessons`, `unit-glance-writing`);
- Contents titles wrap instead of being cut off.

**Tests:** in `teacher.lesson-planner-library-v2.spec.ts`, update the glance assertions, and add a design check: one left card (`unit-sidebar`) with both sections, the day-bars box heading, the Contents hint, the chosen tab marked and joined to the card (`day-tab` with `aria-selected`), the run of show inside its box (`preview-run`), and the writing underline (`preview-writing-line`) under each writing step.

## 2. "Add it" adds the deck

**Problem:** on the stack page, Print it for class (and Take it to class) shows "You built a deck here. It isn't in the lesson yet" or "The planner already made a deck in your conversation" with **Add it**. Add it opens the side panel on "Ask the planner" or "From your conversation", where the teacher has to find the card and click Add to lesson again.

**Why:** `builtDeck.onAdd` in `stack-page-v3.tsx` is `openPanel(...)`.

**Fix:** Add it calls `toggleDeck(messageId, true)`, the same request the card's Add to lesson sends (`add-material`, `materialKey: deck`). The row turns into the deck row (Present, Edit, Rebuild, PDF) on revalidation, with no panel. A deck the teacher edited by hand still asks before it's replaced (the existing `confirmReplace` guard).

**Tests:** the run-6 spec's "a deck made in the chat but never added is offered in the stack" now clicks Add it and expects "4 slides from your stack" with the panel never opening. A new test in the round-4 spec does the same for a deck built on the stack.

## 3. Edit, on a deck built in the stack

**Problem:** the card for a deck built in the stack (`StackDeckCard`) has Add to lesson, PowerPoint and Present, but no Edit. The chat's card has Edit (deck v2).

**Fix:**
- `StackDeckCard` passes `editHref` = `/app/lesson-planner/:id/deck/:messageId?from=stack` to `SlideDeckCard` when deck v2 is on. The editor already takes a reply's id. Saving files the edited deck in the lesson's deck slot, which also adds it, and Close comes back to the stack.
- The "isn't in the lesson yet" row in Print it for class and Take it to class gets **Edit** beside Present and Add it.

**Tests:** in the round-4 spec, a deck built on the stack shows Edit on its card and in the row. Edit opens the editor for that reply, and Close returns to the stack.

## 4. "This lesson is set": confetti, the Yawp! logo and "Yaaaawp!"

**Problem:** setting a lesson only swaps the card. Brian wants a small celebration.

**Fix:** a `LessonSetCelebration` overlay in `v3/lesson-set-celebration.tsx`, shown when the teacher clicks **This lesson is set** (not when a set lesson is loaded):
- **Confetti:** about 160 pieces burst from the middle of the screen, in Yawp! colors (coral, purple, gold, teal), and fall away. It's drawn on one canvas with no new dependency, and lasts about 2.5 seconds.
- **The logo:** a single Yawp! logo (`/img/yawp_black_logo.png`) rises through the confetti: it grows from small, overshoots a little, settles, then fades out with the confetti.
- **The voice:** "Yaaaawp!" is spoken with the browser's speech synthesis, pitched low and drawn out, in a male voice when the browser has one. It runs off the click, so browsers allow the sound. There's no recording in the repo; one can replace the synthesized voice later in one place (`sayYawp`).
- **Manners:**
  - The overlay never blocks clicks.
  - With reduced motion, there's no confetti: the logo fades in and out.
  - It's gone after about 3 seconds.
  - It sits behind `lesson_planner_teach_notes`, which is on in previews.

**Tests:**
- A new e2e test clicks This lesson is set and expects the celebration with the logo. It also expects speech to have been asked for "Yaaaawp!", with `speechSynthesis` stubbed so it can listen.
- Loading a set lesson shows no celebration.
- Unit tests for `celebrationPieces` (count, colors, start point) and `pickYawpVoice` (prefers a male English voice, falls back to any English voice, then to none).

## 5. The exit ticket gets its purple box on the student page

**Problem:** on a share page with "The writing prompt(s)", the Class Starter and Daily Pages each sit in a purple box under their type. The exit ticket shows only lower down, as a handout.

**Why:** `load-shared-lesson.server.ts` builds the prompts from `kind === 'daily-pages' || kind === 'class-starter'` only. An exit ticket is a writing step (round 3, 1.3) but is never a prompt.

**Fix:** `isSharedPrompt(step)` in `lesson-share.ts`. A step is a prompt when it's a writing step whose type is a Yawp! assignment type: Class Starter, Daily Pages, Exit Ticket, Thesis Essay, Five-Paragraph Essay, AP Essay Practice or ACT Writing Practice. The class-starter and Daily Pages kinds still always count. A writing handout that isn't one of those types (a worksheet) stays a handout only. The exit ticket keeps its handout too, as the Class Starter and Daily Pages do.

**Applies to everyone** (it's a bug).

**Tests:**
- Unit tests for `isSharedPrompt`.
- A round-4 e2e test: a lesson with a Class Starter, Daily Pages and an exit ticket, shared to students, shows three prompts with the types "Class Starter", "Daily Pages" and "Exit Ticket".

## Order

1. Plan (this doc).
2. Item 5 (unit test, then e2e, then fix).
3. Items 2 and 3 (e2e, then fix).
4. Item 4 (unit tests and e2e, then the overlay).
5. Item 1 (e2e, then the restyle).
6. Typecheck, unit tests, the touched e2e specs; push to `claude/keen-keller-56x4ww`.

New e2e file: `e2e/tests/teacher.lesson-planner-round-4.spec.ts`, added to smoke and shard 6 like round 3.

## Status

All five items are built, each in its own commit, on `claude/keen-keller-56x4ww`, which is PR 723's branch plus these commits.

- **Item 1:** the unit page is restyled to the design. Two places differ on purpose:
  - Open slide deck and Open the stack replace the design's single button (round 3, 1.11).
  - The "Has handouts" badge is gone, as in the design.
- **Item 2:** Add it adds the deck in place. Two run-6 tests that expected the panel to open now expect the deck to be added.
- **Item 3:** Edit is on a stack-built deck's card and in the "isn't in the lesson yet" row, with deck v2 on.
- **Item 4:** the celebration uses the browser's speech for "Yaaaawp!". A real recording can replace it in `sayYawp()` (`celebration.ts`).
- **Item 5:** a bug fix for everyone.

**Tests:**
- **New e2e** `teacher.lesson-planner-round-4.spec.ts`: 4 tests, in smoke and shard 6.
- **New unit tests** `celebration.test.ts` (in CI), plus a new test in `lesson-share.test.ts`.
- **Local runs:**
  - Passed: round 4, round 3, library v2, run 6, stack v2 and unit build (40 tests).
  - Passed: run 2 to run 5, review and the main planner spec (162 tests).
  - Typecheck is clean.
