# Stack page v2 and Library redesign (Brian's handoff, Oct 24)

Source of truth: Brian's `YAWP-handoff-stack-and-library.md` (Oct 24). It wins over every older note. Visual reference:
- stack: `YAWP_Stack_Page_Redesign-2.pdf` (screens A, B, C)
- library: `YAWP_Lesson_Planner_Library_Redesign.pdf` (L1, L2, L3)

Brian asked to be asked before anything not listed is changed, so this plan builds only what the handoff lists. Where it leaves a choice open, the choice is marked **Call** and goes to Kevin's question list.

**Flags**
- `lesson_planner_teach_notes`, which needs stack v3, covers Part 1's new page parts: Print it for class, Teach it, the notes view, rename on the stack, Google Docs, and no Teams.
- `lesson_planner_library_v2` covers Part 2.
- Both are off in production and created on in previews.
- The two bugs (tasks 1 and 2) are fixed for everyone.

---

## Part 1 · Stack page v2

### 1. Assignment status, one record (bug, no flag)
**Cause:** "Created in Yawp!" is stored on the stack piece (`LessonPlanMaterial.yawpCreatedAt`). An exit ticket created from the chat before it is in the stack has no piece yet. Nothing is recorded, so the stack later says "Not in Yawp! yet".

**Plan:**
1. A new table, `LessonPlanAssignmentLink`:
   - keyed by lesson, reply and block (`conversationId`, `sourceMessageId`, `blockKey`), so it exists before and after filing
   - fields: `yawpHref`, `createdFrom` (`chat` | `stack`) and `createdAt`
   - an additive migration, with a rollback
2. Every Create link names its block (`fromPiece=b:<messageId>:<blockKey>`), from the chat and from the stack. `mark-created` writes the link for that block. A filed piece carrying the old `m:` ref still works.
3. One reader, `assignmentLinks(conversationId)`. The chat cards, the stack steps, the stack panel and the before-class list all read it. Older pieces with only `yawpCreatedAt` still count.
4. On a step card:
   - created: **✓ Assignment created**, muted "in the planner chat" or "on the stack"
   - not created: a dashed purple **+ Create assignment**
5. Tests:
   - unit: the link reader, and old and new refs
   - e2e: create from the chat, then add, and the stack says created; no duplicate

### 2. The one-packet PDF includes the slides (bug, no flag)
**Plan:**
1. Find why the packet drops the deck, with a failing test.
2. The packet becomes lesson plan → slides → handouts, in that order. Each part uses the same renderer as its own download.
3. Caption: "Lesson plan, slides and handouts, in that order."
4. Unit test: every slide title appears in the packet's text, in that order.

### 3. Google Docs opens a real Google Doc (flag)
**Plan:**
1. Clicking **Google Docs** opens a new tab at `/app/lesson-planner/:id/google-doc?doc=plan|handouts`.
2. The first time, the tab goes to Google's consent screen, asking only for `https://www.googleapis.com/auth/drive.file`, with offline access.
   - It reuses the existing sign-in client (`GOOGLE_OAUTH_CLIENT_ID`).
   - The callback is `/app/lesson-planner/google/callback`.
3. The refresh token is stored encrypted in a new table, `GoogleDriveGrant` (one per user). The next click needs no consent.
4. The server builds the same Word file the Word button gives. It uploads it to Drive with conversion to a Google Doc, then sends the tab to the Doc.
5. Caption: "Google Docs opens a new Doc in your Google Drive. The first time, Google asks you to allow it."
6. **Outside the code (Kevin or Bryant):** in the Google Cloud project,
   - enable the Drive API
   - add the `drive.file` scope to the consent screen
   - add the callback URL for each origin (production and previews)

   Until then the button says Google isn't set up and offers Word.
7. Tests: unit tests for the consent URL, the token exchange and the upload request, with the network mocked. A live check is for the preview, after the Cloud setup.

### 4. "Print it for class" (flag)
- Heading **Print it for class**. Subhead "Everything below follows the order on the left."
- **Lesson plan:** "Timed, one page, ready to file" · Word · Google Docs · PDF.
- **Slide deck:** "N slides from your stack" · Present · Edit · Rebuild · PDF. Slides PDF is a new `slides.pdf` route.
- **Student handouts:** "N pages from the steps with a handout" · Word · Google Docs · PDF. Word is a new `handouts.docx` route, built from the same handout pieces as the handout PDF.
- Then the packet link and its caption (task 2), and the Google Docs caption (task 3).

### 5. Post to your class: no Teams (flag)
**Copy link** (primary) and **Share to Google Classroom**. Caption "Using Canvas, Schoology or Teams? Paste the link there." A plain share link, as now.

### 6. Lesson set: two Teach it buttons (flag)
- Keep the stats row.
- Under **TEACH IT**:
  1. **Open slideshow** (filled), "For the smartboard or projector". Opens Present full screen.
  2. **Run of show with teacher notes** (outlined), "For your laptop at the podium".
- With no deck, Open slideshow offers Build the deck instead.
- Library → lesson → Open slideshow takes two clicks.

### 7. Run of show with teacher notes (flag; replaces Run the show)
**The page:** `/show/:id`, laid out as screen B.
- **Top bar:** Back to the stack, title, "Run of show with teacher notes · N min", and Clock (Off / Stopwatch / Countdown), Off by default.
- **Left rail:** every step. Clicking one jumps to it.
- **Now card:** "Now · Step N of M · X min", type chip, Writing badge, title, and that step's slide thumbnail, "Slide for this step".
- **Notes:** labeled sections in full (Open with / Say / Ask / Listen for / Connect back / Move on when), never cut off.
- **Edit notes** → text area → Done, saving as you type.
- **Clock:** Stopwatch counts time in the step. Countdown shows time left; past the plan it shows "+m:ss · past the plan. No rush." in amber.
- **Bottom:** Up next, Back, Next step.
- **No slide syncing.** The old "projector following you" goes.

**Data:** `LessonPlanMaterial.teacherNotes` (text, `Heading:` sections), an additive migration.

**Call:** where the first notes come from.
- The first time the view opens, the planner writes notes for every step in one call: written to the teacher, the five sections, from the step's own text. They are stored and are the teacher's to edit.
- If the call fails, the step's text shows as its notes.
- A step whose text changes keeps its edited notes.

Notes also print on the lesson plan, as a "Teacher notes" section per step in the Word and PDF plan.

### 8. Rename a lesson (flag)
- **Stack page:** a **Rename** pill next to the title → inline input · Save · Cancel.
- **Library:** a pencil on each Lessons on their own card, and **Rename** in the unit view's preview footer.
- Under the input: "Started as '<original>.' Renaming here renames it on the stack page too."
- **Data:** `LessonPlanConversation.originalTitle`, set from the old title on the first rename, then kept. An additive migration.

---

## Part 2 · Library redesign (flag)

A replacement for the folder list. It keeps drag and drop, rename and Move to (now "Move to a unit…").

### Data (additive migration, with rollback)
- **`LessonPlanCourse`** (`membershipId`, `name`, `position`): one tab each.
  - **Call:** courses come from the teacher's own classes, one per distinct class name, e.g. "English 10". A teacher with no classes gets "My lessons".
  - Existing units go to the course of their lessons' class, or the first course.
- **`LessonPlanUnitGroup`** (`courseId`, `title`, `subtitle`, `position`).
- **`LessonPlanUnit`** gains `courseId`, `groupId`, `position` and `kind` (book | texts | poetry | writing | language | skills; default texts).
- **Lessons:** the existing `unitId` + `unitDay` give the order, and day numbers come from it. `setAt` gives Set vs Draft; `lessonDate` gives the date.

### L1 · Library home
- **Header:** "Your library", one line, **New unit** (outline), **Plan a lesson** (primary).
- **Course tabs**, the **kind filter** pills (only the kinds present) and **Select units**.
- **The sequence:** groups (heading, subtitle, unit count, Edit group menu) and units on their own. Tiles sit in a grid (`repeat(auto-fill, minmax(250px, 1fr))`, gap 16).
- **Unit tile:**
  - kind icon and label, ⋯ menu, title, "N lessons · N draft(s)" or "No lessons yet"
  - the purple writing meter with "N% writing"
  - the spec's shadow and a 2px lift, none under reduced motion
  - the whole tile opens the unit
- **New unit:** an inline card (Unit name, Kind, Put it in…) with Create unit / Cancel.
- **Add a group:** with the dashed drop hint.
- **Unit ⋯ menu:** Move to group ›, Group with other units…, Rename, Duplicate, Delete unit.
- **Edit group menu:** Rename, Move up, Move down, Ungroup.
- **Select mode:**
  - checkboxes, and a dark bar: N selected · Group these · Move to group · Done
  - Shift, Ctrl or Cmd-click toggles a tile
- **Drag and drop:**
  - a unit onto a group
  - a unit onto "Drop here to take it out of its group"
  - several selected units together
  - a lesson card onto a unit tile
- **Lessons on their own:** cards with a grip, title (opens the stack), a pencil to rename, Set/Draft badge, one meta line, **Move to a unit…** (every unit, by course), and Open / Keep planning.
- **Undo:** every create, move, group, ungroup, reorder and insert shows the dark status bar with Undo.
  - The server returns the previous state of what it changed, and Undo writes it back.

### L2 · A unit, opened (`/app/lesson-planner/library/unit/:unitId`)
- **Header:** breadcrumb, kind, title, class · dates · day count, **Add an existing lesson**, **Plan another lesson**.
- **Layout:** a grid of `320px minmax(0,1fr)` from 900px, one column below.
- **Unit at a glance:** lessons and drafts, writing total ("N min · N%"), the day-by-day writing bars, and Contents (Day N · title, Draft).
  - **Insert anywhere:** a coral "+" between rows.
- **Add panel:** Where it goes, a Lesson select for an existing lesson, and the result line ("It becomes Day 4…"). It inserts, renumbers, selects the new day and offers Undo.
- **Day tabs:** 68px each, drafts dashed, scrolling with arrows, the selected tab in view.
- **Lesson preview:**
  - "Day N of M · date", title, Set/Draft and Has handouts
  - **Open the run of show** (Keep planning / Start planning)
  - the time bar with the writing line, the totals, and the run of show
- **Preview footer:** Rework in the planner, Duplicate, **Rename**, **Move to another unit…** (with Take it out of the unit).

### L3 · Plan a lesson
- A dialog: "Plan a new lesson", "Pick where it lives now, or decide later. You can move it any time."
- Choices: In a unit (Select, plus "New unit…", and "It becomes Day N, after …"), On its own, Decide when I set it.
- Cancel / Start planning. Start planning opens the planner with that place remembered, and the lesson is filed there when it's created.
- **Stack:** "This lesson is set" offers **Save to unit** when the lesson is in no unit.

### Writing time
The same rule the stack already uses (YAWP! writing assignments, plus plainly-writing steps). Unit totals add every day.

---

## Order of work
1. Migrations, flags and preview seed.
2. Tasks 1 and 2, the bugs.
3. Task 8 (rename) and the stack layout: tasks 4, 5 and 6.
4. Task 7 (notes view).
5. Task 3 (Google Docs).
6. Library data and actions, with undo.
7. L1 home.
8. L2 unit view.
9. L3 dialog and Save to unit.
10. E2e for each task, the full planner suite and typecheck.
11. Push, preview, and screenshots next to the canvas.

## Status
All of Part 1 and Part 2 is built, behind the two flags (both on in previews). The two bugs are fixed for everyone.

| Task | Where | Tests |
|---|---|---|
| 1. Assignment status, one record | `assignment-links*.ts`, `LessonPlanAssignmentLink` | unit + e2e `stack-v2` task 1 |
| 2. One packet with every slide | `one-packet.ts`, `lesson-deck.server.ts` | unit + e2e task 2 |
| 3. Google Docs (drive.file) | `google-drive.server.ts`, `google-doc.server.ts`, routes `…/google-doc`, `/app/lesson-planner/google/callback` | unit (Google faked) + e2e task 3 (not set up → Word) |
| 4. Print it for class | `v3/print-for-class.tsx`, slides PDF, handouts Word | e2e tasks 4 and 5 |
| 5. No Teams | `v3/share-cards.tsx` (`v2`) | e2e tasks 4 and 5 |
| 6. Teach it | `v3/finish-line.tsx`, slideshow mode on `/present` | e2e task 6 |
| 7. Run of show with teacher notes | `show.$conversationId/teacher-notes-show.tsx`, `teacher-notes*.ts`, `LessonPlanConversation.teacherNotes` | unit + e2e task 7 |
| 8. Rename | `lesson-rename*.ts(x)`; stack title, library cards, unit preview | unit + e2e task 8 |
| L1 Library home | `app.lesson-planner_.library/library-home.tsx`, `library-v2*.ts`, `load-library-v2.server.ts` | unit + e2e `library-v2` |
| L2 Unit view | `app.lesson-planner_.library_.unit.$unitId` | e2e L2 |
| L3 Plan a lesson, Save to unit | `plan-lesson-dialog.tsx`, `v3/finish-line.tsx` | e2e L3 |

**Changes from the plan while building:**
- Teacher notes live on the lesson (`LessonPlanConversation.teacherNotes`, keyed by step), not on the material: a step that comes from a kept chat reply has no material row. A second small migration moves the column; the material column had never been written.
- Undo sends back the library as it was (units, groups, lessons' places) and what the move made; Undo removes what was made and writes back only what changed.
- Duplicate copies a lesson's chat, stack and notes as a draft, without its assignments, share links or date.
- A unit's planning chat stays in the unit with no day number and is linked from the unit page, not counted as a lesson.

**Outside the code (Kevin or Bryant):** Google Docs needs the Drive API turned on in the Google Cloud project, the `drive.file` scope added to the OAuth consent screen, and `https://<host>/app/lesson-planner/google/callback` added as a redirect URI for each host (production, demo, and any preview origin in `GOOGLE_OAUTH_ORIGIN_ALLOWLIST`). Until then the button says Google Docs isn't connected yet and offers the Word file.
