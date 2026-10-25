# Brian's round 3 notes (Oct 25): plan

Brian tested "Day 1: The Man Who Made Himself" on the PR 723 preview and sent 11 notes for Part 1 and three for Part 2 (sharing with colleagues). His notes, in full, are in `2026-10-25-brian-round-3-notes.md`. Where they disagree with an earlier spec, Brian's notes win.

This is the plan, item by item: what's wrong, why, and the fix. Each item is tested and committed on its own. Choices the notes left open are marked **(default)**.

Brian's note about the class starter missing from share links is not a bug. He hadn't created it yet, and it showed once he had.

## Lesson titles

### 1.1 No backstage language in titles
- **Problem:** the title is "Day 1: The Man Who Made Himself (50 min) {type: context}". It shows on the stack, unit view, share pages and PDF (title and file metadata).
- **Why:** Build this day replies with `# Day 1: … (50 min) {type: context}`, the step-heading format the prompt asks for. `deriveLessonName` names the lesson from that heading, as written.
- **Fix:** add a `cleanLessonTitle()` to `lesson-name.ts`. It removes `{…}` tags, `[key: value]` tags, durations like "(50 min)" or "· 50 min", and the separators they leave behind. "Day 1:" stays, because it's part of the name in a unit.
  - Applied when the name is written (`deriveLessonName`).
  - Applied when titles are read, so lessons already named that way are fixed too: `buildLessonPacket` (stack page, packet and slides PDFs, share pages, timings), library lesson titles, the unit view, the chat history and the deck loader.
  - Nothing in the database is rewritten.
- **Applies to everyone** (it's a bug).

## The stack page

### 1.2 "Pick a day" works; the period chip shows the period
- **Problem 1:** the date chip is a `<label>` over a transparent `<input type="date">`. Chrome doesn't open a date picker from a click on a label, so nothing happens.
- **Fix 1:** the chip becomes a button that opens the native picker (`showPicker()`, falling back to focusing the input). Once a date is set, a small **Clear** sits beside the chip.
- **Problem 2:** the period chip reads "—" because the lesson has no `periodMinutes`. The unit-day backfill (Kevin's 8a) copies the period only from the unit's planning chat, and this unit's planning chat had none. The day's own heading did say "(50 min)".
- **Fix 2:** if there's still no period after the backfill, read it from the lesson's own title (the "(50 min)" that 1.1 now hides) and store it once.

### 1.3 Only real writing gets the writing treatment
- **Problem:** the meter says "58% writing · 30 min" because the Close Reading Discussion is tagged Writing.
- **Why:** `isWritingStep` runs a "students writing" regex over each step's whole text. Close Reading says "…connections to their own class starter writing…", which matches "class starter".
- **Fix:** a step is writing only when one of these is true:
  - it's a writing kind (class starter, Daily Pages, exit ticket, Thesis module);
  - it has a Yawp! assignment;
  - its type is Class Starter, Daily Pages or Thesis Essay;
  - its **title** names a Yawp! assignment type (Class Starter, Daily Pages, Exit Ticket, Thesis-Driven Essay, Five-Paragraph Essay, AP essay practice, ACT writing practice);
  - it's a closing step whose own text is an exit ticket;
  - it's a handout piece written for students to fill in (kind `handout`, not a reading or context sheet).

  Discussions, quick writes, journals, pair talk and "students write…" in an activity no longer count. A handout attached to a discussion doesn't count either.
- **Where it shows:** this is the one function the stack meter, Ready for class, unit view, Unit at a glance and share pages all use, so they all move together.
- This reverses Brian's run 4 item 6 and run 5 round 2 ("writing on paper counts"). His new note supersedes them, and the old tests are updated to match.
- **Applies to everyone.**

### 1.4 Slides match the stack's times
- **Problem:** the Today's program slide keeps the minutes the planner wrote (16 and 8). The stack says 15 and 10.
- **Fix:** a pure `syncAgendaToStack(deck, steps)` (`deck-agenda.ts`) rewrites each agenda slide's minutes from the stack when the deck is read.
  - **Matching:** each agenda item is matched to a step by title words or by type ("Daily Pages" ↔ the Daily Pages step). If the agenda and the stack have the same number of steps, the order fills any gaps. An item that can't be matched keeps its own minutes.
  - **Why at read time:** the teacher's deck (or their hand edit) is never rewritten, and every viewer agrees: Present, the slideshow, PowerPoint, the slides PDF, the one packet, the share pages and Run of show.
  - **Where:** in the shared deck loaders (`lessonDeck`, `newestBuiltDeck`, `loadLessonDeck`) and the share and stack loaders, using the same step timing as the stack (`lessonRuns`).
- A change only to minutes still marks the deck "changed since these slides were made". The agenda now follows the stack, but other slides may mention times.

### 1.5 Drop "Pick the period length" from Before class
- **Fix:** the "fits" item shows only when a period is known ("Fits the period" or "Fits the period (N min over now)"). With no period it's left out, and it doesn't hold up Ready.
- Brian's idea of an "Adjust class length" button that opens Ask the planner is noted under *Later*. It isn't in Part 1.

## The lesson PDF

### 1.6 Pictures of the slides in the PDF
- **Problem:** the packet PDF prints the deck as a text outline, with no slide faces.
- **Why not real screenshots:** the server has no headless browser or image library (the app's image is PDFKit only).
- **Fix:** draw each slide as a picture in the PDF itself. It's a 16:9 card in the deck's own colors:
  - the gallery plan's ground (paper, pine, ink or accent), color and running head
  - the title in the serif, and the body, bullets, agenda, prompt or quote as it shows on the slide

  The slide's notes print under its picture, two slides to a page. It's vector, so it prints sharp and stays small.
- **Where:** the shared `drawSlideDeck`, so the one-packet PDF and the slides PDF both get it.

## Share pages (class link, student, family)

### 1.7 Label the writing prompts by type
- **Fix:** the heading is "The writing prompt" for one and "The writing prompts" for more. Each prompt gets its own small heading with its type: Class Starter, Daily Pages, Exit Ticket and so on (`writingName`). The "Write it in Yawp!" link is unchanged.

### 1.8 Label handouts by type
- **Fix:** a handout from a writing step is headed "Daily Pages: Franklin's self-made method". Other handouts are unchanged.

### 1.9 Family view says what's expected
- **Fix:** the family's purple box reads: "These assignments are in Yawp!. Your student should finish them before the next class (or by the time their teacher gave)." The list follows.
- The student and class views keep their wording.

## Lesson in the unit view

### 1.10 Dates are optional
- **Fix:** "Day 1 of 4" is followed by " · Oct 27" only when the teacher set a date. "No date yet" is gone.

### 1.11 Two buttons, not "Open the run of show"
- **Fix:** a lesson with content gets **Open slide deck** and **Open the stack**.
  - Open slide deck opens the deck in Present and closes back to the stack.
  - With no deck yet, Open slide deck is shown disabled, with "No slides yet" as its hint **(default)**.
  - An empty day keeps **Start planning**. A draft day gets **Open the stack** plus **Keep planning**.

## Flags
- 1.1 and 1.3 are bug fixes, for everyone the planner is on for.
- 1.2, 1.4, 1.5, 1.6 and 1.7–1.11 change what Brian's preview shows. They sit behind `lesson_planner_teach_notes`, like the rest of this round (`lesson_planner_library_v2` for the unit view), except where the old behavior is the bug:
  - the date chip that does nothing
  - agenda minutes that don't match the stack
- No migration.

## Tests
- **Unit tests first** for:
  - `cleanLessonTitle`
  - `isWritingStep`, with Brian's Close Reading text
  - `syncAgendaToStack`
  - `beforeClass` with no period
  - the period read from a title
  - the share loader's prompt and handout types
- **E2E:** a new `teacher.lesson-planner-round-3.spec.ts` with seeded lessons and no model calls. It covers the clean title, the date chip, the writing meter, Before class, the share-page headings, the family line and the unit-view buttons. It runs in smoke and shard 6 with the other planner specs.
- **Before pushing:** typecheck, the planner unit tests, and lint on the changed files.

## Part 2 (not built this round): sharing with colleagues

### 2.2 A "Colleague" share button
- Add `colleague` to `ShareAudience` (`lesson-share.ts`), next to Substitute, Student, Family and Admin in **Send this lesson**.
- What it includes by default: the plan, the slides with notes, the handouts and the writing prompts. It's the sub's view without "Special instructions", plus the teacher notes.
- The link page (`l.$token`) gets a colleague heading ("Shared by a colleague").

### 2.3 Duplicate the stack into my library
- The colleague page gets **Copy to my library**. It shows only to someone signed in as a teacher with Yawp!. Anyone else sees "Sign in with Yawp! to make a copy".
- A new action deep-copies the conversation, its materials and its kept replies into the viewer's own membership. It reuses `duplicate-lesson` in `library-v2.server.ts`, which duplicates within one teacher's library today.
- **Not copied:** the assignment links, the share links, the dates and the teacher notes.
- The original lesson is kept in a new `copiedFromConversationId` column, so "Copied from Ms. Smith" can show. That's one additive migration.
- **Access rule:** a share link of audience `colleague` lets a teacher read and copy. It never lets them write. The copy is checked against the link's token, not the original lesson's id.

### 2.1 Share to the Faculty Lounge
- This depends on how the Faculty Lounge stores posts. I'd post a card linking to the colleague share link, made the same way as 2.2.
- Then the Lounge needs no new access rules: it holds a link, and the link decides what opens.
- It needs a look at the Lounge's post model before building.

## Later (noted, not in Part 1)
- **Adjust class length:** a button on the time bar that opens Ask the planner with "This is a P-minute lesson. I also need it for N minutes. Should I stretch each step or add something?"
