# Lesson Planner: what we built from Brian's review

Report-out for the work planned in
[`2026-10-11-lesson-planner-brian-review.md`](./2026-10-11-lesson-planner-brian-review.md).
Branch: `claude/beautiful-gates-i8db40` (14 commits, one change each).

## In one paragraph

Everything Brian asked for is built except one item we deferred on purpose:
small per-step tweak controls, which his own "limit the layers" note argues
against. Changes that alter what teachers already see sit behind three new
feature flags, all **off** by default, so nothing changes for current users
until a flag is turned on. The planner's new personality and "offer, don't
prescribe" wording are prompt changes and apply to everyone once deployed.
With the flags off, the existing planner and exit-ticket tests all pass
unchanged.

## How to turn it on

| Flag | What it switches on |
| --- | --- |
| `lesson_planner_intake_v2` | The new intake: real classes, a length per class, one decision per step |
| `lesson_planner_stack_v2` | The stack changes: add any piece, remove from the stack screen, build from the stack |
| `lesson_planner_deck_v2` | The YAWP! deck template and the deck editor |

Each flag can be off, on for everyone, or on for chosen schools, through the
internal feature-flag API like the existing ones. Turn one on for the demo
space first.

---

## 1. The opening questions (intake) — flag `lesson_planner_intake_v2`

**Brian said:** the questions bundle grade, scope and length together; the
answer buttons assume answers; "50 minutes" appears from nowhere; the class
options may not be the teacher's real classes.

**What we did:**
- The card now asks **one thing per step**:
  1. **Which classes?** Checkboxes from the teacher's **real class list**. If
     they teach one class, it is simply named, not asked.
  2. **How long does each meet?** One slider **per class**, starting
     **unset** ("Set the length"). No 50-minute default.
  3. **How do you want to fill the time?** The planner's own options for
     this text (e.g. "Read the whole first story together"), plus
     "Something else".
  4. Activities, when relevant.
- **Any combination works.** The 11th-grade class and the whole story is
  now possible.
- **Kept:** the card that expands in place and the summary line above Send
  ("For English 11 · Period 3, 90 minutes. Read the whole first story
  together.").
- **Lengths are remembered.** Once a teacher sets a class's length, the
  next lesson for that class starts there. This is real data, not a guess.
- The planner's instructions now say: never guess a grade, class or length;
  ask class and length before content.
- The free-text chips that paired a grade with a scope no longer show beside
  the card.

## 2. The stack — flag `lesson_planner_stack_v2`

**Brian said:** the teacher should control what the lesson contains; the
stack should be the lesson; every output should come from it.

**What we did:**
- **"Add to stack" on class starters and Daily Pages.** Each of the three
  options can be added on its own, like exit tickets already could.
- **Remove from the stack screen.** Each piece has a **Remove** button, with
  a few seconds to **Undo**. No more going back to the chat.
- **Tooltip** on "In the stack": "Click to remove from stack". This one is
  on for everyone.
- **"Add all of this" is fixed.** It now reads **"Add the whole lesson to
  the stack"** and appears **only under a full plan**, never under a
  question. **"Add all as a handout" is gone from the chat**; the stack
  screen's Student handout view does that job.
- **Under every full plan:** "You don't have to use all of these. Add the
  pieces you want to the stack, or add the whole lesson." The next-step
  buttons stay where they are, as Brian wanted.
- **Build from the stack.**
  - The stack screen has **"Slide deck from this stack"**, **"Student
    handout from this stack"** and **"Print the lesson plan"**.
  - The planner now sees what's actually in the stack and builds from
    exactly those pieces, so a teacher who kept four of six steps gets a
    deck of those four.
  - The chat buttons switch to "Build the slide deck **from my stack**"
    once something is in it.
- **Lesson name.** A lesson still named after the teacher's raw first
  message now shows "Untitled lesson" with "We'll name it from your plan,
  or type one." It is named from the plan's title when the plan arrives,
  as before.
- **A clear end.**
  - Once the lesson has its deck or handout, an **"I'm done for today"**
    button appears.
  - The planner wraps up warmly instead of offering more rounds.

## 3. The plan itself — on for everyone (prompt)

**Brian said:** offer options, don't prescribe; give framing choices; note
timing for Daily Pages; offer three exit tickets; limit rabbit holes.

**What we did:**
- **Framing options.** When a step frames the text, the planner offers
  historical context, literary context (e.g. metafiction) and the author,
  each as **its own stackable set of lecture notes**.
- **"If you like…" language.**
  - Every teaching move (read-aloud format, think-pair-share, groups) is
    offered with its condition, never as "the right way".
  - Brian's own tip is built in: ask ahead who is comfortable reading
    aloud.
  - Kept the direct "what to push for" voice about the text.
- **Daily Pages timing.** After a reading, the step says it can be done in
  class or assigned as homework, with the teacher choosing.
- **Three exit tickets.** One each for checking understanding of the text,
  explaining a term, and asking a question. Each has Add to stack and
  Create buttons. Alternatives are requested in the chat, as Brian
  preferred.
- **One closing question.** Every plan ends with "Want to refine or edit
  any part of this?" and nothing more.
- **Deck timing.** A deck's minutes must add up to the lesson. Brian saw
  "60 min" on a 90-minute plan.

## 4. The planner's personality — on for everyone (prompt)

Built from Brian's twelve points:
- **Expertise.** PhD-level pedagogy and current research, not fads.
- **On the teacher's side.** Knows real rooms (phones, ADHD, the loud period
  and the quiet one); calm, kind, sometimes funny; never talks down to
  teachers or about students; the department chair who gets it.
- **Teaches and affirms.** Explains the why for new teachers and affirms
  veterans.
- **Offers, never insists.** Never requires or argues; the teacher chooses.
- **Pushback.** Takes it with grace and light humour, then: "Tell me about
  your class or your school. That might help us here."
- **Knows the material.** Knows the texts and courses (canon to
  contemporary, AP Lang/Lit/History, science, math, special education).
  **Names and quotes must be exactly right** (the "Holden Langford"
  example is in the instructions).
- **Questions about itself.** "I'm really just an expert in pedagogy,
  methodology, and lesson planning, and that's where my identity ends." Then
  it moves on.
- **Hard moments.** Takes the high road if a teacher badmouths students,
  and points personal struggles toward a real person in their life.
- **Joyful co-producer.** Planning a lesson is a bit like planning a show.
- **Celebrates the finish.** One or two warm sentences, and may echo a plan
  the teacher mentioned ("Go enjoy the game"). Never probes.
- **Remembers through the library.** New read-only tools let it **search
  and open the teacher's saved lessons**, scoped to that teacher. It does
  not rely on chat memory and says so when it can't find something.

## 5. Slide decks — flag `lesson_planner_deck_v2`

**Brian said:** build a real YAWP! template in the class-tile style;
beautiful, not decorative; no site artwork; replace the little footer mark;
"Save to PowerPoint / Edit / Present"; easy slide deletion; edits replace the
original.

**What we did:**
- **The YAWP! tile template.**
  - Colours come from the app itself: cream page, paper cards, terracotta.
  - Serif titles, with a small mono label above each giving the step and
    its minutes ("YOUR TURN · 8 MIN").
  - Flat colour blocks where a class tile has its art. No images, no clip
    art.
  - Each slide type has its own design: title, class starter or prompt
    card, big framing question, numbered reading-plan tiles, side-by-side
    quote comparison, quote card, notes, and closing.
  - A small "YAWP!" wordmark and slide numbers replace the footer mark.
  - The same look in **PowerPoint** and **Present**. The PowerPoint file is
    still ordinary text boxes, so teachers can keep editing it there.
- **Deck card buttons:** **Save to PowerPoint · Edit · Present**. The "In
  the stack" toggle stays as a smaller control.
- **Deck editor.**
  - Delete a slide in one click, with **Undo**.
  - Reorder, duplicate, and edit any text or speaker notes, with a live
    preview.
  - **Save replaces the planner's deck** in the chat, the stack, Present
    and PowerPoint, marked "Edited". A later planner revision has to ask
    before overwriting it.

---

## Deferred, and why

- **Per-step tweak controls** (plan C5). Brian's own "limit the layers" note
  argues against adding a control to every step. The single closing question
  ("Want to refine or edit any part of this?") covers it for now. Revisit
  after teachers have used the rest.

## Decisions we made with the default recommendations

1. "Add all as a handout" is removed from the chat; "Add the whole lesson to
   the stack" appears only under full plans.
2. The length slider starts unset and remembers each class's length (adds a
   nullable `Class.periodMinutes` column).
3. Building from the stack replaces the lesson's existing deck. A hand-edited
   deck asks first.
4. The wording "You don't have to use all of these. Add the pieces you want
   to the stack, or add the whole lesson." sits directly under the plan.
5. The send-off may echo a plan the teacher mentioned, in one or two
   sentences, and never asks about it.
6. The deck design follows the brief in the plan (layout table, app colours,
   Georgia in PowerPoint because it can't embed the web font).
7. The "In the stack" toggle stays on the deck card beside the three named
   buttons.

## Still worth asking Brian

- Which deck had the **"Phantom YAWP" footer**? No code draws one. It was
  probably written by the model into a slide, or the deck came from the
  Lounge. The new template has no footer mark either way.
- Does the new deck look match what he had in mind? Turn on
  `lesson_planner_deck_v2` for the demo space and present the *Things They
  Carried* deck.

## How it was checked

- **TDD throughout.** Each change was written test-first: unit tests for
  logic and the prompt, e2e tests for every screen change.
- **New e2e spec** `e2e/tests/teacher.lesson-planner-review.spec.ts`: 15
  tests covering each flag on and off.
- **Backward compatibility.** With all flags off, the full existing Lesson
  Planner and Exit Ticket e2e specs pass (86/86 across the three specs). The
  flag-off intake prompt is byte-for-byte unchanged.
- **Unit tests.** All 53 affected test files pass; typecheck is clean.
- **Visual check.** The deck template was rendered through PowerPoint
  (LibreOffice) and the browser, and checked by eye.
- **Migration.** One additive, nullable column (`Class.periodMinutes`), with
  a rollback.
