# Yawp! lesson planner: round 3 notes (Oct 25, 2026)

**From:** Brian. **For:** Kevin, to hand to Claude Code in the repo.
**Tested on:** preview `pr-723` (code `swift-falcon-6020`), lesson "Day 1: The Man Who Made Himself," English 10, unit "Age of Reason/Enlightenment."

## How to use this file

Unzip this folder into the repo (or anywhere Claude Code can read it) and tell Claude Code:

> Read HANDOFF.md and look at every file in `reference/`. Build Part 1 in our codebase. Don't build Part 2 yet; just tell me how you'd approach it. Ask me before changing anything not listed here.

This file adds to the Oct 24 spec (`YAWP-handoff-stack-and-library.md`). If the two disagree, go with this file.

## Reference files

| File | What it shows |
|---|---|
| `reference/01-stack-page-top.png` | Stack page header: title with `(50 min) {type: context}`, the "Pick a day" and blank "—-minute period" chips, the "58% writing · 30 min" meter, the Ready for class panel |
| `reference/02-stack-run-of-show.png` | Run of show: the Close Reading Discussion step is tagged "Writing" |
| `reference/03-before-class-checklist.png` | Before Class checklist with "Pick the period length" |
| `reference/04-share-page-prompts-and-slides.png` | Share page: "The writing prompt" heading over two prompts; the "Today's program" slide with 16 min and 8 min |
| `reference/05-share-page-catch-up-and-prompts.png` | Share page: To Catch Up, the purple box, the writing prompts |
| `reference/06-family-view-purple-box.png` | Family view: the purple assignments box |
| `reference/07-share-page-handouts.png` | Share page: handouts with no type labels |
| `reference/08-unit-view-lesson.png` | Lesson in the unit view: "NO DATE YET," "Open the run of show" |
| `reference/09-lesson-pdf-current.pdf` | The current lesson PDF (no slide images) |

---

## Part 1: Build now

### Lesson titles

**1.1 No backstage language in titles.** (`01`, `08`, `09`)
The title defaults to "Day 1: The Man Who Made Himself (50 min) {type: context}." Use just the lesson's name: no durations, no `{type: ...}` tags, nothing in brackets that came from the generator. This applies everywhere the title appears: stack page, unit view, contents list, share pages, the PDF.

### The stack page

**1.2 "Pick a day" has to work.** (`01`)
Clicking it should let the teacher set a date for the lesson (or clear it). The "—-minute period" chip next to it is blank even though this is a 50-minute class. It should show the period length that's already set.

**1.3 Only real writing gets the writing treatment.** (`01`, `02`, `08`)
Right now the Close Reading Discussion (an Activity) is tagged "Writing," so the meter says 58% writing (30 min). It should be 15 min (Class Starter 5 + Daily Pages 10).

The writing tag, the purple line and the writing totals apply only to:
- Steps linked to a Yawp! assignment type: Class Starter, Daily Pages, Exit Ticket, Thesis-Driven Essay, Five-Paragraph Essay, AP essay practice, ACT writing practice
- A handout the teacher explicitly creates for students to complete in class

Class discussions and other activities don't count as writing, even if they have a handout attached. The same totals are used everywhere: the stack meter, the Ready for class panel, the unit view and "Unit at a glance."

**1.4 Slides should match the stack times.** (`04`)
The "Today's program" slide shows Close Reading 16 min and Daily Pages 8 min. The stack has 15 and 10. When step times change on the stack, the agenda slide should update to match.

**1.5 Remove "Pick the period length" from the Before Class checklist.** (`03`)
The period length is already set in the planner, and the item can't be checked off from there, so it just sits unchecked. Remove it.

### The lesson PDF

**1.6 Include the slides.** (`09`)
The PDF should include an image of each slide in the deck, so a teacher can share the whole lesson with anyone. (This is the same bug as item 2 in the Oct 24 spec: the one-packet PDF is missing the slides.)

### Share pages (class link, student view, family view)

**1.7 Label the writing prompts by type.** (`04`, `05`)
The heading "The writing prompt" sits over two prompts.
- Use "The writing prompts" when there's more than one, and "The writing prompt" when there's one.
- Give each prompt its own heading with its type, e.g. **Class Starter** and **Daily Pages**.
- Note: in this test the Class Starter hadn't been created as a Yawp! assignment yet, so only the Daily Pages prompt had a "Write it in Yawp!" link. That part is correct.

**1.8 Label handouts by type too.** (`07`)
If a handout comes from a writing prompt, name its type (Class Starter, Daily Pages, Thesis-Driven Essay, etc.) in its heading.

**1.9 Family view: say what's expected.** (`06`)
A family's big question is "What is my student supposed to have finished or made up?" In the purple box, say that the following assignments are available in Yawp! and should be completed before the next class session (or by an agreed-upon time).

### Lesson in the unit view

**1.10 Dates are optional.** (`08`)
If the teacher set a date, show it. If not, show nothing. Remove "NO DATE YET." Some teachers plan by date and some just by lesson; a lesson shouldn't look unfinished without one.

**1.11 Replace "Open the run of show" with two buttons.** (`08`)
"Open slide deck" and "Open the stack."

---

## Part 2: Next up (not needed before NCTE)

Don't build this round. Tell Kevin how you'd approach it and what it touches.

**2.1 Share to the Faculty Lounge.** A teacher can share a lesson in the Faculty Lounge.

**2.2 A "Colleague" share button.** At the bottom of the stack page, next to Substitute, Student, Family and Admin. Use cases: a department chair sending a lesson to the department; an English or history teacher sharing one for a faculty meeting.

**2.3 Share the actual stack.** The colleague link works like the other share links. In addition, the colleague can open the stack and duplicate it into their own library to adapt.
