# Kevin's unit-build feedback (Oct 25): plan

Kevin built a unit on the PR 723 preview and recorded 12 notes. The notes, in full with his words, are in `2026-10-25-kevin-unit-build-notes.md`. This is the plan to carry them out, in the order it will be built. Each item is tested and committed on its own.

Defaults chosen where the notes left a choice are marked **(default)**. Kevin can overrule any of them.

## Phase 1: bugs

| # | Problem | Fix |
|---|---|---|
| 8a | A day built from the unit map doesn't know its class or period, so the stack can't say "15 min over". | `createUnitDayConversation` takes the map conversation's `periodMinutes` (or the map day's own `minutes`), `lessonClassLabel` and `originClassAssignmentId`. Days already made get them when their stack first loads: if a unit day has no period, copy it from the unit's planning chat. The day's prompt then has the length. |
| 11 | Student handouts › PDF can download a PDF missing steps, or an empty one. It silently drops any step whose student version hasn't been written yet (only the handouts page writes them). | The handout PDF, Word and Google Doc routes write any missing student versions first, then render. If a version can't be written, the step is kept with a short note instead of vanishing. |
| 12c | Run of show with teacher notes waits for a model call (up to ~25 s) before showing anything. | The page opens at once with each step's own text as its notes and a quiet "Writing your notes…". The notes are written in the background by a new `write-notes` stack intent and swap in without touching a note the teacher is editing. Setting the lesson also starts writing them, without waiting. |
| 10b | Download buttons give no sign of working, so a slow Word or PDF looks broken. A failed one saves an error page as the file. | One download button for Print it for class. On click it shows "Preparing…", fetches the file, checks that it really is one, and saves it. Repeat clicks are ignored. A failure says "Didn't download. Try again" on the page. |

## Phase 2: the chat speaks teacher, not computer

| # | Problem | Fix |
|---|---|---|
| 2 | Words in grey "code" boxes, and internal names (`yawp-daily-pages`, `kind:`, `students` field) in replies. | A prompt rule: never inline code, never internal names; say what it means for the teacher. As a safety net, the chat's Markdown shows any inline code in a planner reply as plain text. Fenced cards are untouched. |
| 7 | Previews show raw `###` and `**`. | One `plainPreview()` helper turns Markdown into clean text: headings, bold, lists, links, tables. It's used by the stack's step excerpts, the add panel's lines, the chat's "On the stack" line and titles. Tested against real replies. |
| 1 | The intake asks "How long is the lesson?" when the teacher is planning a unit. | The intake card knows when the request is a unit or several days ("unit", "week", "N days", a unit map) and asks "How long is each class period?". It also tells the planner the length is per day. |
| 5 | **Build this day** puts a long paragraph in the chat as the teacher's message. | A message can carry a short display line, stored as `LessonPlanMessage.displayText`. Build this day shows "Building Day 1 of *Julius Caesar*: [title]", with a **Details** toggle that lists the day's objective, students, reading and minutes on separate lines. The planner still gets the full request. Build the deck and the other stack builds get short display lines too. |
| 3 | The unit plan should end by checking the plan with the teacher. | Prompt rule: after a unit map, ask two or three short, plain questions (main ideas, day titles, how it ends, e.g. essay or paragraph), and never more. If the plan draws on the teacher's other lessons, say so in one line ("Building on your Girard lesson…"). |
| 4 | Teachers don't know the unit is saved; the arc only lives in the chat. | **(default: option B)** Under the unit map in the chat: "Saved to your library as *[unit]*. Build the days whenever you're ready", with **Open the unit**. The library's unit page shows the unit plan (how it ends, and each day's title and focus). Days not built yet have **Build this day**, which opens the planning chat and builds that day. |

## Phase 3: the stack page

| # | Problem | Fix |
|---|---|---|
| 6a | Creating a piece in Yawp! doesn't add it to the lesson. | Marking a piece created also files it in the stack if it isn't there (the same filing as Add to stack), for a chat piece (`b:`). |
| 6b | After Create, the teacher is left on the assignment page. | **(default)** After creating from a lesson, go straight back to where they came from (chat or stack), showing "Created in Yawp! and added to your lesson." |
| 6c / 10a | "Stack" is invisible jargon. | **(default)** Teachers see **Add to lesson** instead of "Add to stack". The stack page reads as the lesson: its kicker says "Your lesson", plus one line, "Everything you add from the planner lands here, in order." A just-in-time tour is left for a later round with Brian. |
| 9 | The slides don't notice when the lesson changes. | When the deck is filed or rebuilt, store a key of the stack (steps, order, minutes) on the lesson (`deckStackKey`). When the stack no longer matches, show one line wherever the deck appears: "Your lesson changed since these slides were made. Rebuild the slides." The line also offers **Keep these slides**. |
| 8b | Running over isn't called out calmly or specifically. | When the lesson runs over, the fix box gets a lead line, "You've added some great pieces, but this runs N minutes over your P." It suggests one step, chosen by the extension rule, with **Move to extensions**, and that step gets a soft red edge. It's gone once the lesson fits. |
| 8c | No place for "if you have extra time". | A lesson can mark steps as extensions, stored as `LessonPlanConversation.extensionStepIds`. They leave the timed run of show and appear after the closing as **If you have extra time** (one or two). They can be moved back. The extension rule: things students can start and stop at any point. Writing first, then reading on, then discussion. They also show in the run of show with teacher notes. |
| 10c | The printed plan has no place for extensions. | The lesson plan (Word, PDF, kit) gets an **If you have more time** section after Closing, left out when there are none. |
| 12a | "What do I still need to do?" | A short **Before class** list beside This lesson is set, which ticks itself off: fits the period, slides built and up to date, writing pieces made in Yawp! or on paper, handouts ready, date picked. When all are ticked: "Ready to teach", plus one line on how to use it in class. |
| 12b | "Built in 19 min" reads like class time. | Relabel it **Planned in**, with the hint "From your first message to setting the lesson". |

## Left for a decision
- **12d:** two things are called "Run of show". The teaching view's name comes from Brian's spec, so it stays until Brian weighs in. 12c makes it open at once, which removes most of the confusion.
- **6c:** a full just-in-time tour.
- Whether Brian wants planned-but-unbuilt days on his unit page (built here as option B).

## Migration
One additive migration, with rollback:
- `LessonPlanMessage.displayText` (text)
- `LessonPlanConversation.deckStackKey` (text)
- `LessonPlanConversation.extensionStepIds` (JSON)

## Tests
- A unit test for each new helper and intent.
- An e2e spec, `teacher.lesson-planner-unit-build.spec.ts`, with one test per note, using seeded replies with no model calls.
- Typecheck, then the full planner e2e suite before pushing.

## Status
(updated as work lands)
