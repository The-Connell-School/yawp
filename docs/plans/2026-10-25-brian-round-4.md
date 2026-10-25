# Brian's round 4 notes (Oct 25): plan

Brian tested "Sinners in the Hands of an Angry God" (Day 2 of the English 10 unit "Age of Reason/Enlightenment") on the PR 723 preview and sent 8 notes. His handoff, in full, is in `2026-10-25-brian-round-4-notes.md`. Where it disagrees with an earlier spec, this round wins.

This is the plan, item by item: what's wrong, why, and the fix. Each item is tested and committed on its own. Choices the notes left open are marked **(default)**.

## Assignment types

### 1. Exit Ticket wording
- **Problem:** every exit ticket ends with the same elaboration note ("Write as much as you can, and go further than your first sentence…"), and "Explain a concept" adds "Write it the way you would explain it to someone who missed class today — not the definition you were given…".
- **Why:** `composeExitTicketPrompt` (`exit-ticket.ts`) builds every student prompt from the teacher's (or planner's) choices and appends one `EXIT_TICKET_ELABORATION_NOTE` to all of them. The planner never writes the wording itself; it picks a kind, a focus and a topic, so this is the one place to change.
- **Fix:** the closing follows what the ticket asks for.
  - **Explain it in your own words** (Explain a concept, Understand a text, the reflections "What I learned" and "Most interesting", and a custom reflection that asks students to explain or use their own words) ends with exactly: "Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don't worry too much about polish. This is about what you understand, not writing perfectly."
  - **A question or a specific answer** ("Ask a question", "Still wondering", and any other custom prompt) gets no length push. It ends with only "Don't worry too much about polish." **(default:** Brian said the short polish note is fine on any ticket, so every ticket carries it.)
  - "Explain a concept" now reads "In your own words, explain {topic}." The "someone who missed class" and "not the definition you were given" lines are gone, from the student prompt and from the grader's criteria.
  - The planner's voice rule listed "This is about what you understand, not how neatly you say it." as a line to avoid. It's taken off that list, since the new closing is Brian's own wording.
- **Applies to everyone.** Assignments already made keep the prompt they were made with; only new ones read the new way.

### 2. Class Starter and Exit Ticket open at 20 points
- **Problem:** a new Class Starter opens at 100 points, the product default. Exit Ticket's own default is 10, but a ticket created another way can still open at 100.
- **Fix:** one `defaultPointValueForKind(kind)` in `saved-assignments.ts`: 20 for `class_starter` and `exit_ticket`, 100 for every other type.
  - The creation sheet uses it when it opens and when the teacher switches type.
  - The create API uses it when a form posts no point value.
  - `EXIT_TICKET_DEFAULT_POINT_VALUE` becomes 20, so a planned graded ticket and the planner's prompt ("Omit it for the default of 20") agree.
  - Editing an assignment and reusing a saved one keep their own points.
- **Applies to everyone.**

## Share pages

### 3. Student link: the purple box lists types
- **Problem:** the purple box lists each assignment by its step title ("What actually moves people").
- **Fix:** `inYawpTypes(steps)` in `lesson-share.ts` lists the type names the prompt headings use ("Class Starter", "Exit Ticket"), in stack order, once each. Two of the same type read "Daily Pages (2)" **(default)**. The lead line for students and subs becomes "These writing assignments from class are available to complete in Yawp!"; families keep their round 3 line. It applies to every audience that shows the box.

### 4. Admin view: the class, and steps by type
- **Problem 1:** the summary says "Class: Not specified".
- **Why:** the summary is written by the model from `packet.className`. A day built from a unit map has no class of its own, and the unit-day backfill (Kevin's 8a) copied the planning chat's class only when it also copied a period. Brian's unit chat had a class but the day already had a period.
- **Fix 1:** `load-lesson-packet` copies the planning chat's class on its own when the day has none, and falls back to the unit's course name (the library tab, which is the class name). The admin rewrite prompt says to give the class exactly as written, and to write "Not specified" only when no class was given.
- **Problem 2:** the first step reads "What actually moves people", not "Class Starter".
- **Fix 2:** each step sent to the rewrite carries its type ("Class Starter: What actually moves people"), the same chip text the stack shows. The admin prompt says to name each step by its type first. The fallback text (when the model is down) uses the same labels.
- Everything else on the admin page stays as is.

## The stack page

### 5. "Print a packet for class"
- **Fix:** the "Get everything in one packet (PDF)" link becomes a **Print a packet for class** button that opens a checklist styled like Send this lesson's "What they get":
  - [x] Lesson plan
  - [ ] Slide deck (off by default; slides take up the most pages)
  - [x] Student handouts
- With Slide deck checked, **Slides per page: 2 / 4** shows, on 4 by default. The Slide deck row's own PDF gets the same 2 / 4 choice, kept in step with the packet's.
- **Print the packet (PDF)** downloads one document with the checked parts in the checklist's order: plan, slides, handouts. The packet route takes `?parts=plan,slides,handouts` and `?perPage=2|4`. With no `parts`, it prints everything, as before, so old links still work.
- **4 per page:** a 2×2 grid of slide pictures on each sheet, each with "Slide N · minutes · title" and the first lines of its notes under it. 2 per page is today's layout, with full notes.
- Word and Google Docs for the packet are not in this round **(default)**: the PDF is the one Brian required, and the Word builder is per-document today. The individual downloads stay exactly as they are.
- Behind `lesson_planner_teach_notes`, like the rest of Print it for class.

### 6. Rebuild slides message
- **Problem:** after Rebuild the slide deck, the reply says "The deck lives in your lesson stack rather than the Lounge…".
- **Why:** the line is the model's own prose, and Ask the planner shows the first line of the reply.
- **Fix:** a reply on the stack that carries a deck shows "Here you go: new slides based on your revised stack. Everything's updated and ready to go!" in place of the model's line. The stack-surface prompt also tells the model never to mention the Lounge there.

### 7. Saving: make it clear where work goes
**How it works today** (for Kevin, before anything changes):
- **What saves, and when.** There's no timer. Every change on the stack is posted to the server the moment it's made: adding or removing a piece, moving it, its handout, the date, the period, a rename, teacher notes (as you type). Two things wait a moment: a step's minutes save 0.4 seconds after the last click, and a removed piece waits 6 seconds for Undo (it is sent at once if the page closes). "Draft saved" and "Lesson set · saved" only say that the last change reached the server.
- **Where.** Every lesson is a row of its own from its first message. A day built from a unit map is created inside that unit (that's why Brian's Day 2 was already there). A lesson planned "in a unit" from Plan a lesson is filed there too. Any other lesson is "on its own".
- **What the library shows (library v2, on in previews).** Every lesson that isn't deleted: unit days inside their unit, everything else under "Lessons on their own". Nothing has to be saved to appear.
- **What "Save to my library" / "In my library" does.** It sets `publishedAt`. In library v2 that only changes where the lesson opens from the old list (the stack rather than the chat). It mattered in the old library, which split Drafts from My library on it. So in previews it's a label that looks like a button and does very little.
- **What can go wrong.** Nothing warns before leaving. A minutes change made in the last 0.4 seconds before closing the tab is lost. And the page never says where the lesson lives.

**The fix** (behind `lesson_planner_library_v2`; the old header stays without it):
- **The status says where.** "Saved to English 10 › Age of Reason/Enlightenment · 2 min ago", linking to the unit. A lesson on its own reads "Saved to your library › Lessons on their own · just now", linking to the library. While a change is in flight: "Saving…". If a save fails: "Couldn't save. Try again." **(default)**.
- **One library control.** A lesson in a unit, or one already saved, shows **In your library ✓**, a button that opens where it lives. A lesson on its own that was never saved shows **Save to library**, which opens a short list: its units (by course), or **Keep it on its own**. Either choice files it (the existing save-to-unit and publish intents) and the button turns to In your library ✓. The separate "My library" link goes, since the control opens the library.
- **Warn before leaving.** While anything is saving or a minutes change is waiting to save, closing or reloading the tab asks first (`beforeunload`), and an in-app link asks too (`useBlocker`). A waiting minutes change is also sent at once when the page unmounts.
- **An easy way back.** A **Keep planning** strip at the top of the library home and on the planner home: the three most recently changed lessons, each with where it's saved and when, opening the stack (or the chat, for a lesson with nothing in it yet).

### 8. Library: lighter tiles
- **Problem:** tiles use `bg-card`, which is the page's own color (`--card` equals `--background`).
- **Fix:** unit tiles, the New unit card and the "Lessons on their own" rows use `bg-popover`, the near-white `hsl(48 100% 99.0196%)` (it has a dark-mode value too), with `1px` `--border` and a `10px` radius. The resting shadow, hover lift (`-2px`), hover border `hsl(51 8% 68%)` and shadow, 160ms transition and reduced-motion rule match the mockup, which are today's values.
- The unit view's panels (Unit at a glance, Contents, the lesson card, the unit plan, the add panel) take the same near-white background.

## Tests
- Unit: exit ticket closings for each focus and reflection; `defaultPointValueForKind` and the sheet's starting points; `inYawpTypes` and the lead line; the class fallback and step labels sent to the rewrite; the packet's parts and per-page parsing; the 4-up slide layout (page count); the stack deck reply line; the save location line.
- E2E: `teacher.lesson-planner-round-4.spec.ts`, one test per stack/share/library item, seeded (no model calls), added to smoke and shard 6.

## Later
- Word and Google Docs for the class packet.

## Status (Oct 25)

All 8 items are built, each in its own commit. Two flags are involved, both already on in previews: item 5 is behind `lesson_planner_teach_notes` (with Print it for class), and item 7 is behind `lesson_planner_library_v2`. Items 1–4, 6 and 8 apply wherever their feature is on. No migration.

- **Unit tests:** new `lesson-location`, `stack-reply` and `saved-assignments` tests; new cases in the exit ticket, creation sheet, create API, `lesson-share`, `lesson-library`, `one-packet` and `lesson-pdf` tests. The new tests and the exit ticket tests are added to the CI list.
- **E2E:** `teacher.lesson-planner-round-4.spec.ts`, 6 tests, in smoke and shard 6. It passed 3 times in a row (18 of 18). The round 3, library v2, stack v2, unit build, run 4, run 6 and exit ticket specs also passed (54 tests), with `stack-v2` and `round-3` updated for the new packet button and the box listing types. So did the run 2, run 3, run 5, main planner and dashboard-workspace specs (150 tests).
- **Typecheck** is clean.

**Open questions for Brian:**
- The 4-up packet prints each slide's notes, cut to about four lines. Should 4-up drop the notes altogether?
- "Keep it on its own" marks a lesson saved without a unit. Is that the right second choice, or should Save to library always ask for a unit?
