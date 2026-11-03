# Lesson Planner: what we built from Brian's second run

Plan: [`2026-10-12-lesson-planner-brian-run-2.md`](./2026-10-12-lesson-planner-brian-run-2.md).
Built on PR 437's branch (`claude/beautiful-gates-i8db40`), one commit per
change, with the default answer taken for every open decision.

## In one paragraph

The two bugs that broke Brian's trust are fixed for everyone: editing a deck
in the stack can no longer wipe it, and the planner no longer offers
"download" chips that cannot download anything. The stack is now the outline
of the lesson: every step (a reading, a pair talk, a quick write) can go in
on its own, "Add everything" files each piece separately, the teacher drags
pieces into order, removes them from the list, and builds the deck last. The
planner knows the lesson's length on every turn and flags a plan or deck
that runs long. Decks stay on the day's reading, keep minutes off the slide
face, use softer colour and raised tiles, and can be edited on the slide
itself. The lesson plan downloads as a concise plan in Word and PDF. The
stack can sit beside the chat while the teacher plans.

## How to turn it on

| Flag | What it turns on |
| --- | --- |
| `lesson_planner_stack_v2` (wave 1) | Everything stack-related below, the swap flow, the time flags in chat |
| `lesson_planner_deck_v2` (wave 1) | Deck look, on-slide editing, deck time flags, deck editor from the stack |
| `lesson_planner_stack_panel` (new) | The stack beside the chat (needs stack v2) |
| `lesson_planner_plan_export_v2` (new) | The concise lesson plan in Word and PDF |

All four are off in production and on in PR previews (the preview seed turns
the two new ones on too). Prompt changes and the two bug fixes apply to
everyone.

## What changed, by Brian's item

**Ship-first fixes (no flag).**
- **Deck wiped by Edit (23, 24, 25, 27).** The stack's text editor wrote the
  teacher's typing over the deck's slides. The server now refuses a text edit
  on a deck, the text "Edit" is gone from deck items, and the stack's deck
  card has the deck editor's Edit, Present and Save to PowerPoint beside
  Remove and Save as PDF. The editor returns to the stack when opened there.
- **Download that did nothing (33).** "Create Lesson Plan", "Save Lesson Plan
  as PDF" and "Print Lesson Plan" were chips the planner wrote; clicking one
  only sent its words. Those chips are now dropped, the chat offers "Open the
  stack to download the lesson plan" instead, and the prompt says files come
  from the stack page.

**The stack is the outline (1-7, 17, 21, 26, 35-39).**
- Drag to reorder or move up/down; the order saves itself (new nullable
  `position` columns). The stack page, PDFs and the planner all read it.
- Remove sits on every list row, with Undo. No filters.
- Each plan step has "Add to stack" (new "Lesson step" kind); Writing
  Practice has it too.
- "Add everything to the stack" files every step and block as its own piece,
  in order. An older whole-lesson item can be "Split into pieces".
- Class starters, Daily Pages and exit tickets say what they are and offer
  "Create this … in YAWP!" from the stack.
- Library codes (FW-021 and the like) never show: not in the stack, the
  PDF, chat prose, chips or swap options. Filed starters keep the id as data
  (new nullable `promptId`).
- "Create handouts" replaces "Student handout"; the build links sit under the
  list, deck last ("Rebuild the slide deck" when one exists); "Send this
  lesson to a student who missed class" asks for a make-up handout.
- The stack panel beside the chat (item 39): pieces appear as they are added,
  with remove and reorder there and "Open the full stack".

**Fit the period (8, 9).** The planner reads the length from the teacher's
answer and keeps it on the lesson (new nullable `periodMinutes`,
`lessonClassLabel`), so it hears it on every turn. The stack rule that told a
deck to total the pieces' minutes is fixed. A plan past the period shows
"This plan runs 57 minutes; the period is 50" with "Trim it"; the deck card
and editor flag a long deck; the stack header shows planned against the
period.

**The deck (10-16).** Prompt rules keep a deck to the day's reading, ban
consecutive duplicate titles and time instructions in slide text; a rebuilt
deck is not seeded from the old one. Minutes come off the slide face (they
stay in the editor, the presenter notes and the PowerPoint notes). One shared
theme: softer orange for big blocks, raised white tiles with a faint orange
border, no band on the class starter. Slide text is editable on the slide and
stays in sync with the form. The footer mark can be the wordmark (default),
faded, or none.

**The lesson plan (28-32).** A concise plan in the shape of the YAWP!
pre-writing plan: Overview, Goals, Teacher will, Materials, numbered
Instructions with what happens and why, Closing. One model call per version
of the stack writes the summaries (cached; falls back to first sentences).
"Lesson plan for Word / Google Docs" is the main download, with a PDF and the
full packet beside it. No logo.

**Chat (18, 20-22, 26).** "Swap out the class starter prompt" is pinned
under a starter; the reply shows each prompt with Add to stack, "Replace
existing class starter with this one" and "Create class starter assignment".
A bundled starter block becomes one card per prompt. "YAWP!" everywhere,
with a test that fails on any other spelling. "You don't have to use all of
these" shows under plans written as bold timed steps too.

## Decisions taken with the default

1. Same PR as wave 1 (Kevin).
2. File chips are filtered in the app as well as the prompt.
3. Drag uses the browser's own drag and drop plus up/down buttons; no new
   dependency for it.
4. "Add everything" files pieces, not one whole-reply item, under stack v2.
5. `promptId` column added.
6. "Replace existing class starter" removes every class starter in the stack
   and takes the first one's place.
7. Plan summaries come from one cached model call, using the planner's AI
   budget.
8. Word export uses the `docx` package; no Google Drive sign-in this wave.
9. Colour values: soft orange `#EBC0AE`, tile border `#F1D5C9`. Tune with
   Brian on the preview.
10. New flags as listed above.

## Where the build differs from the plan

- **Exit tickets keep one shared slot.** The plan suggested a slot each.
  One exit ticket per lesson, where picking another replaces the one in the
  stack, matches "pick one" and keeps revisions working.
- **The period's class is kept as text** (`lessonClassLabel`), not a class
  id: the teacher's answer names the class, it does not carry an id.
- **On-slide editing does not add or remove bullets.** Enter finishes a
  field; the form below adds and removes bullets.
- **The footer mark is a renderer option**, not yet a setting: the logo
  image variant waits for Brian and Kevin's decision, and the faded
  wordmark covers Brian's "phantom" idea in the meantime.
- **Bundled starter blocks now split.** A reply written before this change
  with several prompts in one block numbers its later starters differently;
  only such malformed replies are affected.

## Still for Brian and Kevin

- Footer: wordmark, faded, or none (item 15).
- "Write for 4 minutes. Go." is now kept off slides (item 16); say if it
  should stay.
- Make-up handout wording and placement (item 38).
- The two new colours, on the preview.

## How it was checked

- Tests first throughout: unit tests for domain, server and prompt changes;
  a new e2e spec, `e2e/tests/teacher.lesson-planner-run-2.spec.ts` (27
  tests, each flag on and off where it matters).
- All planner e2e suites pass together: 113 tests across the original
  planner spec, the exit ticket spec, the wave 1 review spec and the run 2
  spec. The original planner spec runs with every flag off.
- Every planner unit test file passes on its own (63 files); typecheck is
  clean.
- CI now runs both review e2e specs in smoke and the new unit files.
- Rendered and checked by eye: the restyled slides in Present, the Word
  file through LibreOffice, the PDF, the stack page and the chat panel.
- Four additive, nullable migrations, each with a rollback.
