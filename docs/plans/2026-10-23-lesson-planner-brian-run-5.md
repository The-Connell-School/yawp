# Lesson Planner, Brian's run 5 (Oct 23): priority items

Source: Brian's six priority notes from planning a week of *Lord of the
Flies* (English 10, Period 3: Day 1 lecture, Day 2 close reading, Day 3
vocab quiz and Daily Pages, Day 4 discussion). His full notes follow
separately; this round is the six he put at the top. He also praised the
voice and the weekly framework: none of that changes.

## The items, the cause, the plan

### 1. Each day of a multi-day plan is its own lesson, in a unit folder

**Cause.** A unit made from "Create a Unit" already gives each day its own
lesson, but only when a day is built from the unit map, one at a time. A
week planned in an ordinary chat ("a 4-day flow") is one reply. Its days
are just headings, so everything goes into the one conversation's stack.
The library lists every conversation as its own row and has no idea a
unit exists.

**Plan.**
- `plan-days.ts`: `readPlanDays(reply)` finds two or more "Day N" headings
  (any level), and gives each day its title, its minutes and its text, with
  its steps as `##` headings so each day reads as a single lesson.
- A multi-day reply in the chat offers **Make each day its own lesson**.
  One request creates the unit (or uses the conversation's unit), one
  lesson per day titled "Day N — …", each with that day's plan and its
  steps already in its stack, with the conversation's class and length.
  Running it again opens the days already made, never a second copy.
- A multi-day reply has no per-step "Add to stack" and no "Add
  everything", which is what put four days in one stack. Each day header
  says "Day 1 · Open lesson" once made.
- The library shows **unit folders** beside standalone lessons: the unit's
  name, its days in order, and the planning chat. Days no longer also
  appear as loose rows.
- The planner is told to write a multi-day plan as `# Day N: title (50 min)`
  with the day's steps as `##` headings, timed and typed as in a single lesson.
- Behind `lesson_planner_stack_v3` (on in previews).

### 2. The planner forgot the teacher's structure in the same conversation

**Cause.** Each turn sends the model the last 20 messages, cut at 24,000
characters from the newest back. A four-day plan is long, so after two or
three replies the teacher's first message, where Brian laid out the
structure, was no longer in what the model saw. It searched saved lessons
because the conversation no longer held the answer.

**Plan.**
- `planner-history.ts`: every teacher message is always sent. The
  teacher's words are short and they are the brief. Long planner replies
  past the budget are condensed to their outline (title and step headings)
  instead of dropped, so the model still sees what it planned. The
  database read takes the whole conversation, up to 80 messages, not the
  last 20.
- Prompt: the conversation is the first memory. Before searching saved
  lessons for something the teacher described, look back in this
  conversation, and never ask them to retype it. A structure the teacher
  defines (a weekly flow) carries into any unit built in the conversation.
- Offering it as a **saved framework** needs a decision: templates today
  save one lesson's shape, not a week's. See questions.

### 3. Adding a day to the stack lost its time

**Cause.** With days as `##` headings and steps as `###`, the step reader
took the days as the steps: Day 1 became one piece, typed "Context" and
given 5 minutes.

**Plan.** In a multi-day reply the days are days (item 1), never steps. In
each day's lesson every timed step is its own piece with its minutes, so
5 + 25 + 10 + 5 + 5 tallies to 50.

### 4. Type the minutes

**Plan.** Tapping "5 min" on a run-of-show card turns it into a number
field. Enter or leaving the field saves (1–120); Esc cancels. The +/−
buttons stay.

### 5. Preview a piece before adding it

**Cause.** The Add panel's cards show the title and one line.

**Plan.** Each card has **Preview**, which opens the whole piece on the
card (the exit ticket's questions, the full step). Pieces from "Ask the
planner" are the same cards.

### 6. Writing defaults to a Yawp! assignment

**Cause.**
- In the stack chat, "Ask the planner" files new pieces as plain notes, so
  an exit ticket made there can never be created in Yawp!.
- The planner's own rules say a sticky-note check is not an exit ticket,
  and it reached for sticky notes and scrap paper for written work.
- Reflections and pre-writes in prose had no Create link.

**Plan.**
- The stack chat returns a piece's writing kind. An exit ticket files as
  a Yawp! exit ticket, a class starter or Daily Pages prompt as that
  assignment, and any other writing as a quick write, each with "Create
  this … in Yawp!".
- Planner rule: anything students write defaults to a Yawp! assignment,
  using the planner's exit ticket and Daily Pages blocks. Never a sticky
  note, an index card or scrap paper for written work. The quick visual
  check for understanding stays, but it is not where writing goes.
- Prose writing steps (reflection, pre-write, response, quick write,
  journal) offer "Create this quick write in Yawp!".
- "Paper instead" stays on the before-class list as the teacher's choice,
  never the default.

## Order of work

Tests first in each step; one commit per item.

1. Items 1 and 3: days, unit lessons, library folders, prompt.
2. Item 2: history and prompt.
3. Item 4: typed minutes.
4. Item 5: preview.
5. Item 6: writing defaults.
6. e2e spec `teacher.lesson-planner-run-5.spec.ts`, the planner suites,
   typecheck, push, PR, timesheet and questions.

## Status (Oct 23)

All six done and on PR 437, with `main` merged in. Notes:

- **Item 1.** Making the days is one click under the reply. The days are
  ordinary lessons (`unitDay` set), so they open, set, share and run like
  any lesson. A unit built from "Create a Unit" already worked this way,
  one day at a time; its folder now shows in the library too.
- **Item 2.** The fix is in what the model is sent each turn. There is no
  saved "framework" yet: a lesson template keeps one lesson's shape, and
  a week's shape is a new kind of thing to keep (see questions).
- **Item 3.** It came from the same cause as item 1. A one-day plan still
  files each timed step with its minutes, as before.
- **Item 4.** The +/− buttons stay.
- **Item 5.** Preview is on every Add panel card, including pieces from
  "Ask the planner".
- **Item 6.**
  - Writing from the stack chat now files as the Yawp! assignment it is.
  - The planner's own lessons use the exit ticket and Daily Pages blocks
    for all written work. "Paper instead" is still on the before-class
    list as the teacher's choice.
  - Not testable end to end: what the model writes. E2E stubs the model,
    so unit tests cover the prompt rules and the stack chat's filing. Try
    a week and a stack-chat exit ticket on the preview.
- **No new flags or migrations.** Items 1 and 3 sit behind
  `lesson_planner_stack_v3`; the rest change behavior already behind it or
  the prompt (version `2026-10-23-review-v1`).

## Round 2: Brian's full notes and Kevin's library folders

Brian's full notes (`Lesson-Planner-test-2026-10-23.md`) confirm the six
items above and add four things. Kevin added library folders the teacher
controls.

| # | Note | Cause | Plan |
| --- | --- | --- | --- |
| R1 | Day 1's plan came into the stack as one 5-minute Context piece ("Day 1 Lecture Notes") | Besides days read as steps (fixed above), a plan whose steps are a table row or a numbered list without bold labels has no steps the stack can read. Only the material blocks file, and the lecture notes landed with the default 5 minutes | `readPlanSteps` falls back to a table with a minutes column ("\| 5 min \| Hook \| …"), and to numbered or bulleted steps with minutes ("1. Hook (5 min)"). Each row is a step with its minutes |
| R2 | The planner should do it automatically: a multi-day request makes the folder and one lesson per day | Day lessons are made only on the button | The first multi-day reply in a conversation makes the unit and its day lessons as it is saved, and the card shows the days, ready to open. A later revision of the week shows **Replace the day lessons with this version**, which asks first, then replaces the days the teacher has not changed (an edited day is kept and named) |
| R3 | A teacher's structure as a named framework: carried into the unit, offered to save, and each day knows its type | Nothing keeps a week's shape | Migration (additive, with rollback): `LessonPlanUnit.framework` and `LessonPlanTemplate.days` (both nullable JSON). Making the days stores the unit's framework: each day's title and its steps' types and minutes. Each day lesson's prompt says which day of the framework it is and what that day is for. The days card offers **Save this week as a framework**. "Build from my templates" lists saved frameworks and plans the next week from one |
| R4 | Writing in the weekly plan was set for paper or the board: a one-sentence written answer, 90 seconds of writing, a sentence in their notes, 30 minutes of Daily Pages | The prompt rule above covers the planner. A step written that way had no Create link | The prose writing check also reads "a one-sentence answer", "a written answer", "in their notes/notebooks", "N seconds/minutes of writing" and Daily Pages, so each offers "Create this … in Yawp!" |
| K1 | Library: create folders, drag lessons in, organize | Folders exist only as units the planner makes | A folder is a unit. In the library: **New folder** (named), rename, and delete (its lessons stay, back to standalone). Drag a lesson onto a folder, or use **Move to…** on any lesson (keyboard and phone friendly). Inside a folder, up and down reorder the lessons, and **Take out of folder** ends membership. All scoped to the teacher; behind `lesson_planner_stack_v3` |

### Order of work

1. R1 and R4 (step and writing reading).
2. K1 (folders: API, library UI, e2e).
3. R2 (automatic days, replace with confirm).
4. R3 (migration, framework on the unit and in templates, prompt context).
5. Suites, typecheck, push, PR, timesheet and questions.
