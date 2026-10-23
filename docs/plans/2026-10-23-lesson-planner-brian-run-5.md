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
