# Brian's round 5 notes (Oct 26): plan

Brian tested a Day 2 *Common Sense* lesson (English 10, Period 3) and a lesson he set on Oct 25 and reopened on Oct 26, on the PR 723 preview. He sent 12 notes, a new personality doc, his screenshots and two Claude Design mockups. His notes, in full, are in `2026-10-26-brian-round-5-notes.md`; the personality doc is in `2026-10-26-lesson-planner-personality.txt`. Where they disagree with an earlier spec, these notes win.

Three items are marked REPEAT (1, 3, and part of 10). For each one this plan says why the earlier fix didn't land, so it isn't fixed in the wrong place again.

Each item is tested and committed on its own. Choices the notes left open are marked **(default)**.

## 0. The personality doc

- **Ask:** replace the planner's current personality and voice guidance with the Oct 26 doc. Keep the functional instructions (the stack, assignment types, slides, share pages).
- **Where:** `build-system-prompt.ts`, the "Who you are" and "Your personality" sections, and the "beginning, middle, and end" section, which holds the celebration and goalposts rules.
- **Fix:**
  - Rewrite those sections to follow the doc's 15 points, in its order and wording: pedagogy expert; on the teacher's side; helps new and veteran teachers; honors choices; takes pushback with grace; knows the texts, courses and students; never makes things up; deflects personal questions; pedagogy questions versus personal or harmful ones; joyful co-producer; celebrates when done; finds past work in the library; self-contracting and self-transcending; never boring; the scaffolded week.
  - Keep the functional lines that live in "Who you are" and aren't personality: the Yawp! spelling, plain words with no code formatting, and the domain-expertise lines (differentiation, group work, speaker and audience).
  - New in the prompt: 7 (never makes things up), 12 (looks in the library first, and asks for title, topic or date when it can't find a match), 13 (the two tendencies, built into every lesson), 14 (never boring), 15 (the scaffolded week, offered as an option and never as a requirement).
  - Brian's open question 2: the planner gets the teacher's profile name. `teacherName` is passed as `null` today; pass `User.name`. The prompt says to use it for "the ___ Show", keeping a title the teacher's name carries (Ms., Mr., Dr.), and to say "the [your name here] Show" when there's no name. Never "the Brian Connell Show".
  - Bump `LESSON_PLANNER_PROMPT_VERSION`.
- **Brian's open questions:**
  1. Memory: the planner sees this conversation in full, plus the teacher's saved lessons through `search_my_lessons` and `read_my_lesson`. It doesn't see other chats directly.
  2. Teacher's name: answered above. The profile has one `name` field and no honorific, so the planner uses the name as the teacher wrote it.
  3. Closing wishes: kept to Brian's rule (short, warm, never probing).
- **Test:** `build-system-prompt.test.ts` checks for each new section, for the teacher's name in the intro, and for the "[your name here] Show" fallback.

## Library

### 1. White tiles (REPEAT, round 4 #8)
- **Problem:** the unit tiles and the "Lessons on their own" rows are cream on cream.
- **Why it didn't land:** `TILE` in `library-home.tsx` uses `bg-card`. In `app.css`, `--card` is `46.6667 36% 95.098%`, the same value as `--background`. The class reads like "white card", but it isn't one, so the round 4 change had nothing to show.
- **Fix:** `TILE` uses `bg-popover`. That token is exactly `hsl(48 100% 99.0196%)` in light mode, and a lifted surface in dark mode. The shadow and hover lift stay as they are, and the unit view's cards use the same surface (item 2).
- **Test:** a unit test pins `TILE` to the white surface and Brian's resting shadow. The library-v2 e2e reads the tile's computed background and checks it's white, not the page color.

### 2. The unit view matches the design
- **Problem:** the unit view is boxier than `reference/05`.
- **Note:** the `design/` mockup folders didn't come through with the notes, only the screenshot. The screenshot of the design is the reference.
- **Fix:** restyle `library_.unit.$unitId/route.tsx` to match it:
  - **Header:** the breadcrumb with Library in the accent color; the kind label; a larger title with the course line under it; and two pill buttons, "Add an existing lesson" (outline) and "Plan another lesson" (filled, accent).
  - **Left: one white card.**
    - "Unit at a glance" with two stats: Lessons ("20 · 2 drafts") and Writing ("571 min · 57%", in purple).
    - A lavender panel, "Writing minutes, day by day", with the bars.
    - Contents: "Day N" in a narrow muted column, the title wrapping instead of truncating, the selected day on a soft tan fill, and "Draft" in the accent color.
    - The hint line: "Hover between two days and click + to add a lesson right there."
    - The insert lines stay.
  - **Right: day tabs joined to the card, like folder tabs.**
    - Each tab shows the day and its date.
    - The selected tab is white and opens into the card; the others sit on a tan fill.
    - The chevrons stay at the ends.
  - **Right: the lesson card (white).**
    - "Day 1 of 20 · Mon, Nov 2" in muted sentence case, then the title.
    - Small "Set" and "Has handouts" chips.
    - The run-of-show bar is segmented: each step in its type color, small gaps between them, and a purple underline under writing steps. Under it: "50 of 50 min · right on time", and "46% writing · 23 min" in purple.
    - The step rows sit in a bordered box: minute, type chip, title, a Writing pill, and minutes.
    - **Footer:** "Rework in the planner" as an outline pill; "Duplicate" and "Rename" as text buttons; "Move to another unit…" as a select on the right.
  - **Buttons (default):** the mockup's single "Open the run of show" became two buttons in round 3 (1.11, Brian's later call): Open slide deck and Open the stack. Both stay, styled as the mockup's pill. Open the stack is the filled one.
- **Test:** the library-v2 e2e checks the pieces: the glance stats, the bar panel, the folder tabs with dates, the segmented bar, the chips, the footer. A screenshot goes in the PR.

## Assignments

### 3. Exit Ticket wording (REPEAT, round 4 #1)
- **Problem:** new exit tickets still say "not the definition you were given, but what you actually understand it to mean", "someone who missed class" and "go further than your first sentence".
- **Why it didn't land:** the student's prompt isn't written by the planner. Yawp! composes it in `exit-ticket.ts`, from `EXIT_TICKET_FOCUS_OPTIONS[].template` plus `EXIT_TICKET_ELABORATION_NOTE`, and the old phrases live there. The missed-class page's rewrite then paraphrased that composed prompt. A change to the planner's prompt alone can't reach it.
- **Fix: in the Exit Ticket type's own rules (`exit-ticket.ts`), so every exit ticket gets it, from the planner or from the form.**
  - `explain-concept`: "In your own words, explain {topic}." Drop the "someone who missed class" and "not the definition" sentence.
  - Two endings in place of one:
    - **Explain** (`EXIT_TICKET_EXPLAIN_NOTE`), word for word: "Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don't worry too much about polish. This is about what you understand, not writing perfectly."
    - **Short** (`EXIT_TICKET_SHORT_NOTE`): "Don't worry about polish."
  - Which ending each prompt gets:

    | Prompt | Ending |
    |---|---|
    | learned, interesting, explain-concept, understand-text | Explain |
    | ask-question, wondering | Short |
    | A teacher's own prompt | Explain when it asks students to explain or put something in their own words; short otherwise **(default)** |

  - `EXIT_TICKET_ELABORATION_NOTE` stays exported as the explain ending, so older imports still compile.
  - **Grading:** the exit ticket grader is told not to mark grammar, syntax or polish unless the teacher turned grammar grading on. A check confirms where the exit ticket grading instructions are built.
  - **The planner prompt:**
    - The exit-ticket section lists the new wording.
    - It says never to restate the ending in prose.
    - The rewrite prompts for share pages are told not to paraphrase a prompt (item 7).
- **Backward compatible:** prompts are composed when the assignment is created and stored on it, so existing assignments keep their text.
- **Test:**
  - `exit-ticket` unit tests: every composed prompt for every focus and reflection prompt has no "not a definition", "actually understand it to mean", "missed class" or "first sentence"; explain prompts end with the exact sentence; question prompts don't say "write as much as you can".
  - The assignment-sheet and exit-ticket-block tests are updated.

### 4. The prompt is editable in the assignment builder
- **Problem:** an Exit Ticket's prompt can't be edited before Create.
- **Why:**
  - The builder shows the composed prompt as read-only text ("What students will see").
  - The server ignores a posted prompt for exit tickets. `resolveAssignmentPrompt` always composes it again.
  - Class Starter (and every other type) already has an editable Prompt box. The planner's create link fills it, and the teacher can change it.
- **Fix:**
  - "What students will see" becomes an editable textarea, filled with the composed prompt.
  - Once the teacher types in it, the sheet keeps their text. It posts `exitTicketPromptEdited=1` with the prompt, and a "Use the suggested wording" link puts the composed one back.
  - The server stores a posted prompt when `exitTicketPromptEdited=1` and it isn't empty. Otherwise it composes, as now. The config is stored either way, so grading still knows what the ticket checks.
- **Test:**
  - Unit: `resolveAssignmentPrompt` with and without the flag.
  - Sheet test: an edited prompt posts.
  - E2E: from the stack, create a Class Starter and an Exit Ticket, change a word in each, and see the change on the student's assignment.

## Slides

### 5. Edit the deck right after it's built in the chat
- **Problem:** a deck built in the planner sidebar on the stack page (Ask the planner) shows Add to lesson, PowerPoint and Present, but no Edit.
- **Why:** `StackDeckCard` (`v3/stack-deck.tsx`) never passes `editHref` to `SlideDeckCard`. The chat page does.
- **Fix:** pass `editHref={deckV2 ? …/deck/<messageId>?from=stack : null}`. The deck editor already takes a message id (the chat uses it that way), and `?from=stack` brings the teacher back.
- **Test:** e2e. Build a deck in Ask the planner, click Edit, change a slide title, save, and see the change on the card and in Present.

### 6. "Add it" adds the deck
- **Problem:** Add it, in Print it for class (and Take it to class), reopens the sidebar.
- **Why:** `builtDeck.onAdd` is `openPanel(...)`.
- **Fix:** `onAdd` calls `toggleDeck(conversationDeck.messageId, true)`, the same `add-material` the sidebar's Add to lesson posts, including its "replaces the deck in your lesson" confirm. The panel stays closed.
- **Test:** e2e. Build a deck, close the sidebar, click Add it. The deck is in the lesson (Print it for class shows Present, Edit, Rebuild) and the sidebar is still closed.

## Share pages

### 7. Every audience follows the stack's structure
- **Problem:** the sub plan, the student page and the family page name steps in their own way ("Step 2 — When rules stop making sense", "Yawp!").
- **Why:**
  - The rewrite for each audience gets each step's title and text, but not its type.
  - The prompt says "call each step by the name it has in the lesson" without saying what that name is.
- **Fix:**
  - `stackStepName(step)` in `stack-steps.ts`, the name the stack shows:
    - a writing step's type ("Class Starter", "Exit Ticket", "Daily Pages");
    - otherwise its label when it has one ("Class Discussion");
    - otherwise the type ("Activity", "Read aloud").
  - The rewrite input gives each step as `Class Starter: <title>`, marks Yawp! writing assignments ("a writing assignment in Yawp!"), and says how long they write.
  - `REWRITE_VOICE` gets a structure rule: one heading per step, in the stack's order, and each heading starts with the step's name exactly as given ("## Class Starter: When rules stop making sense"). No "Step 2" and no "Yawp!" as a step name, and the writing prompts aren't paraphrased.
  - `fallbackLessonText` uses the same heading.
  - Admin uses the same rule. The colleague view and the PDF take it when they're built; the colleague view isn't built yet (round 3, Part 2). The lesson PDF already headings steps from the stack.
- **Test:** `lesson-share` tests check the rule is in every audience's system prompt, the input names each step's type, and the fallback headings.

### 8. Sub plan: send students to Yawp! for the writing
- **Fix:** the sub's system prompt adds:
  - For every step marked as a Yawp! writing assignment, say plainly that it's a writing assignment in Yawp!, have students open Yawp! and find the **Class Starter** (or Exit Ticket, …), and say how many minutes they have.
  - Never "we'll hear a few responses" or any discussion move for a writing step.
- **Test:** unit test on the sub prompt and the step input.

### 9. Missed-class student page: label the steps, show every prompt
- **Fix:**
  - The student rewrite uses the stack names (item 7) and is told never to write "To catch up on the Yawp!"; the last step is called by its name (Exit Ticket).
  - `loadSharedLesson` puts every Yawp! writing step under prompts: Class Starter, Daily Pages, Exit Ticket, Thesis and the rest (`step.isWriting` with an assignment kind), not only `daily-pages` and `class-starter`.
  - Each prompt keeps its type heading and its "Write it in Yawp!" link, and the heading becomes "The writing prompts" over more than one.
  - An exit ticket's prompt shows the prompt students actually see. When the assignment was made in Yawp!, that's the stored assignment prompt; otherwise it's the step's text.
- **Test:** `loadSharedLesson` and share-page tests. The outline, the purple box and the prompts list the same assignments, by type.

### 10. Class link: the purple box and the prompts match (partly a REPEAT, round 4 #3)
- **Why it didn't land:** the round 3 change labeled each prompt by type, but prompts still came only from `daily-pages`/`class-starter`, so an Exit Ticket never reached the list. The purple box lists `step.title`, a shortened prompt.
- **Fix:**
  - The prompts come from item 9.
  - `inYawp` lists each assignment by type: "Class Starter", "Exit Ticket". When two share a type, the title follows ("Class Starter: When rules…").
  - The class link (Post to your class) and the email pages share one page component (`l.$token`), so both get it.
- **Test:** the round-3 e2e family-page check is extended to the class link: two assignments in the box, by type, and two prompts, each with its heading and link.

## Setting the lesson

### 11. "Set this lesson," with a celebration
- **Fix:**
  - The button reads **Set this lesson**. The how-it-works page text changes to match.
  - On a successful set, a one-time celebration in the finish-line corner:
    - a confetti burst on a small canvas over that card, with no dependency (about 80 pieces, 1.6 s, then removed);
    - the line **"Hear me yawp, hear me yawp, hear me yaaaaaawp!"** pops in word by word above the set card;
    - both last about 2.5 s, use `pointer-events: none` so nothing on the page is blocked, and then the page settles into the set state.
  - With `prefers-reduced-motion: reduce`: the yawp line only, no confetti, no movement.
  - It plays only when the teacher clicks Set, never on loading a lesson that's already set.
- **Test:**
  - Unit: the reduced-motion choice.
  - E2E: click Set this lesson. The yawp line shows and then goes; the confetti canvas exists without reduced motion and doesn't with it. Existing specs that click `set-lesson` keep working (same test id).

### 12. "Planned in" counts real working time
- **Problem:** `builtIn(createdAt, setAt)` is the clock time from the first message to set: 21 hr.
- **Fix (changed from the first draft of this plan, see below):**
  - The chat page and the stack page report time in use to a new `active-time` intent on the stack API. A tick counts when the tab is visible and the teacher has clicked, typed or scrolled in the last two minutes. The page sends a report at most once a minute, and again when the tab is hidden or closed.
  - Reports are added to `LessonPlanConversation.activeSeconds`, a new column, only while the lesson isn't set. A set lesson that's just being looked at adds nothing.
  - Lessons from before this change read their time from what they recorded: messages, pieces added or edited, assignments made, and the set. Each gap between two of those counts only when it's under 10 minutes; a longer gap counts 1 minute (`planned-time.ts`).
  - Planned in is the larger of the two numbers. The label under it reads "of time working on it".
  - Brian's case: about 20 minutes on Oct 25, plus 1 or 2 on Oct 26.
- **Why not events alone, as first planned:** reordering the stack and changing a step's minutes leave no timestamp, so a teacher who spent 15 minutes on the stack page would have read as 1 minute. Brian asked for "time with the lesson open and active", and only the page can see that.
- **Migration** `20261026120000_lesson_active_time` (additive, with a rollback).
- **Test:**
  - Unit tests for `plannedMinutes` (one sitting, two days apart, idle tab, a single event), `inUse`, and the API intent.
  - E2E: the 20 minutes plus 1 case reads 20 to 22 min.

## Order of work

1. Plan doc (this file) and notes.
2. Item 1, white tiles.
3. Item 3, exit ticket wording.
4. Item 4, editable prompt.
5. Items 5–6, slides.
6. Items 7–10, share pages.
7. Item 11, set and celebrate.
8. Item 12, planned in.
9. Item 2, the unit view.
10. Item 0, the personality doc.
11. E2E spec `teacher.lesson-planner-round-5.spec.ts`, then typecheck, unit tests and the affected e2e specs.

Every item applies under the flags its feature already uses. Items 1, 3 and 4 apply to everyone, because they're fixes to existing behavior.

## Status (Oct 27)

Everything above is built, in this order of commits:

| Item | Commit | How to check it in the preview |
|---|---|---|
| Plan and notes | `2435e8e7` | — |
| 1. White tiles | `651547cd` | Library home: every unit tile and "Lessons on their own" row is near-white on the cream page. |
| 3. Exit Ticket wording | `f9ef983b` | New exit tickets explain in your own words and end with "Keep it conversational…"; a question ticket ends "Don't worry about polish." None of the old phrases appear. |
| 4. Editable prompt | `4459a011`, `f7516349` | Create an Exit Ticket and change a word in "What students will see"; the assignment keeps your words. Reopen it to edit: your words are still there. Class Starter's Prompt box was already editable. |
| 5. Edit the deck | `617dd3fb` | On the stack, open Ask the planner (or From your conversation): the deck card has Edit, and Close comes back to the stack. |
| 6. Add it | `2dd41d43` | Close the sidebar, click Add it in Print it for class: the deck is in the lesson and the sidebar stays closed. |
| 7–10. Share pages | `46e89ae7` | Sub plan, missed-class page, family and admin pages, and the class link use the stack's names and order. The sub is told to send students to Yawp! for the Class Starter and Exit Ticket. The purple box lists assignments by type, and every Yawp! prompt shows with its type and link. |
| 11. Set this lesson | `356e7dfc` | The button says Set this lesson. Clicking it plays confetti and the yawp line once; with Reduce Motion, the line only. |
| 12. Planned in | `65550f36` | Set a lesson, come back the next day, edit for a minute, set it again: Planned in goes up by a minute or two. |
| 2. Unit view | `d16d512e` | Open a unit next to `reference/05`. |
| 0. Personality doc | `e2e3f6ac` | — (prompt only). The planner now also gets the teacher's profile name. |

**E2E:** `teacher.lesson-planner-round-5.spec.ts`, with 8 tests, is in smoke and shard 6.

**Not done, and why:**
- The `design/` mockup folders didn't arrive with the notes, so the unit view follows the screenshot of the design (`reference/05`).
- A prompt edited in Yawp! after the assignment was made from the planner isn't shown on share pages. Assignments made from the planner don't record their assignment id: `mark-created` stores only a link. Share pages show the prompt the lesson composed. A stored assignment prompt is used when the id exists.
- The colleague view isn't built yet (round 3, Part 2). When it is, it takes the same structure rule as the other audiences.
