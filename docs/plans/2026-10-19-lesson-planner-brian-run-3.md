# Lesson Planner: Brian's third run and the stack page redesign

Sources, in order of authority when they disagree:

1. **Kevin's redesign brief (Oct 19)**: the stack page, the Add a piece
   panel, Run the show, templates, writing time, colors and data changes.
   The Claude Design canvas that goes with it
   (`claude.ai/artifact/FKEUFs4mgVmHj2V6NU9mbp`) sits in another claude.ai
   organization and could not be opened from this session. Kevin sent its
   boards as a PDF instead (`YAWP_Stack_Page_Redesign.pdf`: stack page, Add a
   piece from your conversation, Ask the planner, Run the show, and the
   planner start screen with templates). What the boards add beyond the
   brief is listed under "What the design boards add" below.
2. **Kevin's notes on the stack chat**: a chat message on the stack page
   changes the stack and answers with one line plus Undo. Long
   back-and-forth stays on the planner page. The stack page should look
   different from the planner and be as simple as possible.
3. **Brian's run 3 log** (`session-log-run-3.md`): Draft #3, the same Day 1
   *Things They Carried* lesson, 50-minute period, 14 items for Kevin.
4. **The slide deck brand**: sent separately as a Claude Design link. It has
   not reached this session (see Decision K4).

Built on: `claude/gracious-wozniak-s6ps88`, which is PR 437's head
(`claude/beautiful-gates-i8db40` @ f6fd2625) with `main` merged in cleanly.
All code paths are under `services/web-app/app/` unless they start with
`packages/` or `e2e/`.

Companion documents: the wave 1 plan and report
([plan](./2026-10-11-lesson-planner-brian-review.md),
[report](./2026-10-11-lesson-planner-brian-review-report.md)), and the wave 2
plan and report
([plan](./2026-10-12-lesson-planner-brian-run-2.md),
[report](./2026-10-12-lesson-planner-brian-run-2-report.md)).

---

# Part 1. The outline

## The idea in one paragraph

The lesson planner has two rooms. **The planner chat is where a teacher
thinks**: they explore, build, and have the long back-and-forth. **The stack
page is the run of show for one class period**: they put it in order, check
the time, make the final calls, and send it out. Most of Brian's run 3 asks
are about the edge between the two rooms. Every segment the planner suggests
should be one tap from the stack. The stack's state should show the same
everywhere. Times should be right. The stack should tell the teacher when it
runs long and offer a fix. Kevin's redesign answers the rest: the stack page
gets its own calm look, and finishing is the reward. Choices stay few, the
teacher makes every call, and nothing regenerates forever.

## Guiding rules (apply to every item below)

- **The fun comes from finishing, not tinkering.** Few choices, and each one
  is final.
- **The teacher makes the call.** The app offers at most two fixes or
  options and never rearranges the stack on its own. (Brian: "Always give
  the teacher options, not to overwhelm them, but to help them just make
  decisions.")
- **One source of truth.** The stack holds the step, its minutes, its type
  and whether it is writing. The chat cards, the summary list, the time bar,
  the lesson plan, the handouts and the deck all read from the stack.
- **A step holds only its own content.** No planner commentary, totals, or
  questions.
- **Writing time is protected.** Fixes never cut it. It is measured and
  shown.

## What the teacher sees, room by room

### A. The planner chat (thinking and building)

1. **Add to stack on every segment, where it appears.** A hook, warm-up,
   discussion, mini-lesson, quick write or exit ticket each gets its own
   Add to stack on its heading in the reply. The "Steps in this plan" list
   stays. *(Brian 1)*
2. **One status per segment, everywhere.** "In the stack" shows on the card,
   the summary list and Add everything, however the piece got in. No
   duplicates. Removing or reordering on the stack page updates the chat.
   *(Brian 2)*
3. **The full lesson opens with framing**: "Here's a full lesson. You don't
   have to use all of it. Give it a quick read first, then add the pieces
   you want to your stack, or take the whole thing." No more "I have
   everything I need." *(Brian 3)*
4. **"Create this assignment in YAWP!" on every writing step**: class
   starter (with a pick when there are three prompts), Daily Pages, exit
   ticket, quick writes, Thesis Essay modules. Once created it reads
   "Created in YAWP! · Open." *(Brian 4)*
5. **Short, real titles** for Daily Pages and other prompt-based steps
   ("Daily Pages: What one item reveals"). *(Brian 11)*
6. **Picks up wherever the teacher starts.** The planner doesn't ask again
   for anything already said, asks only for what's missing, then returns
   the full lesson with the framing line. *(Brian 13)*
7. **Build from my templates**: one new start tile, second after "Plan a
   lesson". *(Kevin 4)*

### B. The stack page (refining and deciding)

A new page with its own look (warm paper, Bricolage Grotesque headings,
Instrument Sans body, a color for each step type). It replaces today's stack
page behind a flag.

1. **Header**: Back to planning, a save indicator ("Saved", or
   "Lesson set · saved"), In your library. Then the title and chips for
   class/period, date and period length. The duration is the sum of the
   steps. *(Kevin 1, 7; Brian 6, 9)*
2. **Time bar**: one bar, a block per step sized by its minutes and colored
   by type, with leftover time striped. A status chip reads "Right on
   time", "N min to spare" or "N min over". Clicking a block opens that
   step. *(Kevin 1; Brian 6)*
3. **One-tap fixes, only when over time**: at most two, each with Apply.
   Trim the longest non-writing step (never below 3 min), or move a Context
   step to tomorrow. Fixes never cut writing time. *(Kevin 1; Brian 10)*
4. **Writing line and meter**: a thin purple line under each writing step,
   and a strip that reads "N% of class is writing · N min, from Class
   Starter + Daily Pages". *(Kevin 1, 5)*
5. **Run of show**: one compact card per step, showing its start minute,
   drag handle, type chip, Writing badge, title, a −/+ minutes stepper,
   move and remove. A card opens to show an excerpt, "Has a handout", "Edit
   this step" and "Rework it in the planner". *(Kevin 1; Brian 1 nice-to-have)*
6. **Adding pieces**: a "+" line between cards, or "Add another piece" at
   the end. Either opens the Add a piece panel, and the spot holds a dashed
   "New piece goes here". *(Kevin 1, 2)*
7. **The stack chat** is Ask the planner, inside the Add panel. "Shorten
   the hook to 10 minutes" changes the card and the total, then shows one
   line with Undo. "A quick pair activity after the read aloud" returns a
   piece card. It is never a long conversation, and it is logged to the
   same lesson conversation. *(Kevin's note; Brian 7)*
8. **Finish line**: "Ready for Monday?", then "This lesson is set". The set
   card shows built-in time, minutes planned and % writing, plus Run the
   show, Save this shape as a template, and Keep editing. *(Kevin 1)*
9. **Take it to class**: Lesson plan (Word / Google Docs / PDF), Slide deck
   ("Build the deck"), Student handouts (Print / PDF), full packet PDF.
   This replaces "When the sequence is set" in the new design and carries
   the same four things. *(Kevin 1; Brian keep-list)*
10. **Post to your class**: a share link that opens what the teacher
    checks; Share to Google Classroom, Canvas, Schoology, Teams, Copy link.
    *(Kevin 1)*
11. **Send this lesson**: Substitute / Student / Family / Admin tabs, each
    with a recipient, a "What they get" list, a note box, and a send
    button. The Student tab replaces "Send this lesson to a student who
    missed class". *(Kevin 1; Brian 8)*
12. **First-open line**: "This is your lesson. Put it in order, check the
    time, or tell me what to change below. When it looks right, set it and
    take it to class." Shown once. *(Brian 13, shortened to fit the new
    page)*

### C. The Add a piece panel

It slides in from the right, so the teacher stays on the stack page. It says
where the piece will go. It has two tabs:

- **From your conversation**: suggested pieces not yet in the stack, each
  with its impact ("+15 min · puts you 15 over · writing to 38%").
- **Ask the planner**: replies come back as piece cards only.

Add with a click or by dragging into the run of show. After an add, the
insert point moves past the new piece. *(Kevin 2)*

### D. Run the show

The teacher's dark view during class. A rail of steps, a Now card (notes and
the projector slide), a clock (Off / Stopwatch / Countdown), calm amber
overtime, Next advances the slides too, and "That's the show." at the end.
*(Kevin 3)*

### E. What goes out of the room

- **Lesson plan document**: the stack decides the sections, so there is
  never a second Closing. Times come from the stack. It is fully editable,
  with optional blank sections (Standards, Learning objectives, Materials,
  Differentiation / accommodations, Assessment). Teachers choose Word or
  Google Doc. *(Brian 12)*
- **Handouts for any step**, written for students. Every step is listed,
  student-facing steps are checked by default, and writing steps get answer
  lines sized to the task. *(Brian 8)*
- **Slide deck**: built from the stack (it is no longer a stack item), with
  each step getting its slide, in the new brand. *(Kevin 7; Brian 1, 14)*

### F. Data

Steps carry type, minutes, hasHandout, isWriting (derived) and an optional
label. Lessons gain set/created/set-at timestamps. Unadded suggestions are
kept. Templates are saved per teacher. Carry-over steps go to the class's
next lesson. Writing minutes add up across lessons later. *(Kevin 5, 7)*

## What the design boards add (beyond the written brief)

- **Stack page copy.** The eyebrow above the title reads "YOUR LESSON,
  START TO FINISH". The time bar reads "50 of 50 minutes planned", with a
  type legend under the writing strip ("Writing (purple line)"). Run of
  show has the subline "Drag to reorder. Times update as you go." Each card
  shows "00 / MIN IN" as its start minute. Under the list: "Add another
  piece from the planner" and "Or hover between any two steps and click +
  to add one right there."
- **Finish card.** "Ready for Monday?" then "Right on time. Set it and it's
  ready to teach." The button is black, with a check: "This lesson is set".
- **Take it to class** is a dark card.
  - Lesson plan: "Timed, one page, ready to file", with Word (primary),
    Google Docs and PDF.
  - Slide deck: "9 slides, one per step", then "Build the deck".
  - Student handouts: "3 pages from the steps marked with a handout",
    then Print and PDF.
  - "Or get everything in one packet (PDF)".
- **Post to your class** is nested in the dark card. Its subline is "One
  link to a student page for this lesson". The link can open: Slide deck,
  Lesson handouts, Daily Pages prompt. The helper copy reads "Google
  Classroom opens in a new tab. Pick your class there and post it as an
  announcement, material or assignment." Then "Share to Google
  Classroom", and "Elsewhere:" Canvas, Schoology, Teams and Copy link.
- **Send this lesson** says "We rewrite it for whoever is reading." So each
  audience gets a version the planner rewrites, not just a link.
  - Sub tab: Substitute's email.
  - What they get:
    - "Sub-ready lesson plan" (step by step, with exact times and what to
      say)
    - "Handouts to print" (ready to copy before first period)
    - "Slide deck link" (opens without a YAWP! login)
    - "Class roster for Period 3" (off by default)
  - The special instructions box says "Shows up at the top of their plan,
    before anything else."
  - The button reads "Send sub plan".
- **Add to your lesson panel.** The title is "Add to your lesson". It shows
  "Goes in at minute 20, after 'Hook activity: What's in your bag?'" and
  "Right now: 50 of 50 min" with the status chip. The intro reads "The
  planner suggested these in your conversation. They aren't in the lesson
  yet. Drag one into your lesson, or click Add." Each card has a drag
  handle, the type chip (including "Thesis Essay · Module 1"), minutes,
  title, one line, the impact in coral and "+ Add". Ask the planner is a
  short chat: the teacher's line in a coral bubble, then one sentence from
  the planner and a piece card. The input reads "Describe what you need…".
  The footer reads "Need a bigger change? Continue in the planner →".
- **There is no separate chat bar at the bottom of the stack page.** The
  only input on the page is Ask the planner, inside the Add panel. That
  changes the default for Decision K10.
- **Run the show.**
  - The top bar has the subline "English 10 · Period 3 · 50 min".
  - The Now card reads "NOW · STEP 2 OF 8" and "Planned: 15 min". The
    notes are the short, spoken version of the step, not the full text.
  - The slide thumbnail is captioned "On the projector now · slide 2".
  - The rail shows a check on done steps, the number on upcoming ones,
    minutes as `15'`, and a purple dot for writing.
  - The bottom strip reads "UP NEXT Frame — Historical context 4 min",
    with Back and a coral "Next step →".
- **Start screen.**
  - The template chip is coral: "Using your template: Read & write day ×".
    The placeholder reads "What are we reading? e.g. Ninth grade, Chapter
    2 of The Things They Carried".
  - "YOUR TEMPLATES" sits above "OR START FROM ONE OF THESE". Each row
    shows the shape as "Class Starter → Context → Read aloud → Daily Pages
    → Closing · 50 min", plus a bar and "34% writing".
  - The tile grid has three columns. "Build from my templates" is
    highlighted: "Start with a lesson shape you've already saved."
- **Mockup rendering glitch, not a design choice.** On writing cards the
  purple Writing badge overlaps the title. Build it as a chip on the
  type-chip line.

## Where Brian's log and Kevin's brief meet (and how this plan reconciles them)

| Topic | Brian (run 3) | Kevin (Oct 19) | This plan |
| --- | --- | --- | --- |
| Stack chat | A small chat box that knows the stack, shares the conversation, has undo | Commands only: one-line confirmation + Undo, no long reply. The boards put the only input in the Add panel's "Ask the planner" | One input: Ask the planner. A request for a piece returns piece cards. A change ("shorten the hook to 10 minutes") is applied and answered with one line plus Undo. Messages are logged to the same conversation and show in the planner as compact "Stack change" lines. **Decision K10.** |
| Over-time options | 2–4 options in words, including "keep one framing note", "Daily Pages to homework", "split across two days" | At most two one-tap fixes; never cut writing | Kevin's two fixes. Brian's options that cut writing (Daily Pages to homework) are out by rule. "Split across two days" is what "move to tomorrow" does, one step at a time. Anything else, the teacher types into the stack chat. |
| "When the sequence is set" panel | Keep as it is | Replaced by Finish line + Take it to class | The new page carries the same four outputs (plan, handouts, deck, absent student). The old panel stays on the old page while the flag is off. **Decision K1.** |
| Back link | "Back to lesson planner chat" | "Back to planning" | "Back to planning" plus a tooltip/subtitle "Your chat, with this stack saved". **Decision K2.** |
| First-open instructions | A specific sentence pointing at the chat "below" | Simple page | Brian's sentence shortened to the new page's verbs. |
| Absent student link | Under the stack only, not in the handout panel | Student tab in Send this lesson | Student tab. The old link stays on the old page, removed from its handout panel (bug fix). |
| Google Doc | Ask Word or Google Doc; open as a Google Doc | Lesson plan: Word / Google Docs / PDF; no Google account connection for Classroom in v1 | v1: Word download plus a guided "Open in Google Docs" path. Real Google Doc creation waits for Drive consent. **Decision K3.** |

---

# Part 2. The detailed plan

## Where the code is today

| Area | Today | Code |
| --- | --- | --- |
| Stack page | `routes/app.lesson-planner_.$conversationId.packet/route.tsx` (893 lines). The loader is `loadLessonPacket`. The page has no action; every write goes to `routes/api.domain.lesson-planner.packet/route.ts` (intents L60–74). | `domain/lesson-planner/load-lesson-packet.server.ts` |
| Stack data | `LessonPlanConversation` is the lesson (`periodMinutes`, `lessonClassLabel`, `planSummary`, `publishedAt`). `LessonPlanMaterial` is a stack piece (`slot` unique per conversation, `kind`, `audience`, `content`, `position`, `promptId`, `blockKey`, `sourceMessageId`). Kept replies are `LessonPlanMessage.keptAt`. **There is no minutes, type or writing column.** | `packages/prisma/schema.prisma` L1537–1654 |
| The deck | A `LessonPlanMaterial` with slot `deck` and kind `slides`, so it shows in the stack. | `lesson-material.ts` L37, 292–303 |
| Header "22 min" | `packet.totalMinutes` reads "(N min)" from the section's *derived* title, which is the first heading or first sentence of the content. The hook's first sentence "Give students 2 minutes…" beats its filed title "Hook (15 min)". `readMinutes` has no word boundary. Untimed pieces add 0. The chat uses a different sum (`plan-timing.ts`). | `lesson-packet.ts` L51–81, 265, 293–313 |
| Missing times | Daily Pages and framing notes are filed with titles that carry no minutes. The single `add-material` path also ignores the minutes a block inherits from its step. The outline shows "—". | `artifact-from-reply.ts` L54; `reply-pieces.ts` L32–41; packet API L461–565 |
| Commentary leak | The last plan step runs to the end of the reply. So the model's "Total: …" line (asked for at `build-system-prompt.ts` L401) and its closing question (L355) end up inside Closing. | `plan-steps.ts` L70–78, 108 |
| Add to stack in chat | Fenced blocks have cards with a toggle. Prose steps (the hook) are plain markdown with no button; they can be filed only from the "Steps in this plan" list. | `routes/app.lesson-planner/route.tsx` L1427–1532, 1639–1685 |
| "In the stack" status | A client-only `Set` of `messageId:blockKey` tokens, seeded by the loader and reset only when the conversation changes. A removal on the stack page doesn't reach an open chat. A step and the block inside it are two tokens, so adding one doesn't mark the other. | route.tsx L384, 400–414, 650 |
| Create in YAWP! | Class starter, Daily Pages and exit ticket only. There is no Thesis Essay mapping. **Nothing records that an assignment was created.** | `stack-create-link.ts` L26–65; `yawp-catalog.server.ts` L327–346; `routes/app.assignment-types.$id/route.tsx` L770 |
| Handouts | Only `audience === 'student'` pieces qualify: class starter, Daily Pages, exit ticket and student `yawp-material`. Steps, framings and practice are teacher-only. | `student-handout.ts` L36–73 |
| Lesson plan doc | `buildLessonPlanDoc` always appends a Closing section, even when the last instruction is a Closing step. Step titles are bold list runs, not headings. | `lesson-plan-doc.ts` L253–307; `lesson-plan-render.server.ts` L72, 166 |
| Opening line | "I have everything I need. Here's the plan." is model text. The prompt already forbids preambles (L541–543); nothing enforces it. | `build-system-prompt.ts` |
| Deck brand | Tokens are in `tile-theme.ts` `TILE_COLORS`. The canvas hard-codes Cormorant Garamond. There is no brand parameter. | `tile-theme.ts` L29–41; `tile-slide-canvas.tsx` L23 |
| Start tiles | `prompt-tiles.tsx` `TILE_FACES` plus `RECOMMENDED_LESSON_PLANNER_PROMPTS`. | `prompt-tiles.tsx` L32–86; `build-system-prompt.ts` L765–856 |
| Share / LMS | None. The only LMS link is Blackboard LTI. Email goes through Resend, with capture in previews. | `domain/unified-signon/resend-mail.server.ts` |
| Fonts | Bricolage Grotesque and Instrument Sans aren't loaded anywhere. `app.css` loads only Cormorant Garamond. | `app/app.css` L1 |
| Flags | `lesson_planner_intake_v2`, `_stack_v2`, `_deck_v2`, `_stack_panel`, `_plan_export_v2`: off in prod, on in previews via the seed. | `feature-flags.ts` L46–129; `packages/prisma/scripts/local-dev/seed-lesson-planner-feature-flag.ts` |
| Tests | Unit tests sit beside the code (`bun test app/`). E2E planner specs seed conversations and never call the model: `teacher.lesson-planner*.spec.ts`. New migrations must be listed in `packages/prisma/scripts/lesson-planner-migration-order.test.ts`. | |

## Ground rules (from AGENTS.md)

- **TDD.** For a screen or flow: write the e2e test first. For domain,
  server or prompt changes: write the unit tests first.
- **Backward compatible.** Everything a teacher sees goes behind a flag.
  The old stack page stays the default until the new one has run in
  production for a couple of weeks. Schema changes are additive and
  nullable, with `rollback.sql`. Readers fall back to today's derivation
  when a new column is null (dual-read). Writers fill both the new columns
  and the title's "(N min)" while the old page is live (dual-write).
- Small atomic commits, one change each.

## Flags

| Flag | Covers | Depends on |
| --- | --- | --- |
| `lesson_planner_stack_v2` (existing, off in prod) | Chat-side fixes: Add to stack on every segment, synced status, framing line, Create in YAWP! on every writing step, short titles, correct times, the commentary strip | none |
| `lesson_planner_stack_v3` (new) | The redesigned stack page, Add a piece panel, stack chat, fixes, writing meter, Finish line, Take it to class | stack v2 |
| `lesson_planner_share` (new) | Post to your class and Send this lesson | stack v3 |
| `lesson_planner_run_show` (new) | Run the show | stack v3 |
| `lesson_planner_templates` (new) | Save as template, Build from my templates tile | stack v3 |
| `lesson_planner_plan_export_v2` (existing) | Lesson plan document changes | none |
| `lesson_planner_deck_v2` (existing) | New deck brand; deck built from the stack | none |

All new flags are off in prod and on in previews, so the preview seed gets
four new rows. `getLessonPlannerReviewFlags` forces each dependent flag off
when its parent is off.

## Data changes (one migration each; all additive, nullable, with rollback)

**M1. Step fields on `LessonPlanMaterial`** (`…_lesson_step_fields`):

- `minutes Int?`: the step's planned minutes. Null means fall back to
  today's title parse.
- `stepType String?`: one of `class_starter | activity | context |
  read_aloud | daily_pages | thesis_essay | closing`. Null means derive it
  with `stepTypeFor(kind, title)` (below).
- `label String?`: for example "Module 1" for a Thesis Essay module.
- `hasHandout Boolean?`: null means derive it (student-facing or writing).
- `yawpAssignmentId String?` and `yawpCreatedAt DateTime?`: set when
  "Create in YAWP!" finishes, for the "Created in YAWP! · Open" state and
  for isWriting.
- **isWriting is not stored.** It is derived on read (`isWritingStep`):
  true when the step has `yawpAssignmentId`, or its kind is one of
  class-starter, daily-pages, exit-ticket or thesis-module. The brief says
  "any step tied to a YAWP! writing assignment counts". A class starter is
  tied by kind before it is created, so the meter is right from the first
  add. **Decision K5.**

**M2. Lesson state on `LessonPlanConversation`** (`…_lesson_set_state`):

- `setAt DateTime?`: isSet is `setAt != null`. Keep editing clears it.
  `createdAt` already exists; "built in N min" is `setAt − createdAt`.
- `lessonDate DateTime?`: the date chip and "Lesson set for Mon, Oct 19".
  Today the date shown is creation time.

**M3. Templates** (`…_lesson_templates`): a new `LessonPlanTemplate` table
with `id`, `membershipId`, `organizationId`, `name`, `slots Json` (an
ordered list of `{type, minutes, label?}`), `periodMinutes`, `createdAt`,
`deletedAt`.

**M4. Carry-over** (`…_lesson_carry_over`): a new `LessonPlanCarryOver`
table with `id`, `membershipId`, `classKey` (the class id when known,
otherwise the normalized `lessonClassLabel`), `fromConversationId`, a
snapshot (`kind`, `title`, `content`, `minutes`, `stepType`), `createdAt`
and `consumedAt?`. The next lesson for the same class claims it and files it
at position 0. **Decision K6** covers what "next lesson" means.

**M5. Stack-chat messages** (`…_lesson_message_surface`): `LessonPlanMessage.surface
String?`, where null means chat and `stack` means a stack command. The
planner shows stack messages as one compact line and leaves them out of the
model history beyond the last few.

**M6. Share links** (`…_lesson_share_links`): a new `LessonShareLink` table
with `id`, a hashed `token` (unique), `conversationId`, `includes Json`
(what the link opens), `audience` (`student | family | sub | admin`),
`createdAt`, `revokedAt?` and `expiresAt?`.

**Unadded suggestions: derived, not stored (Decision K7).** Kevin's brief
says to store them. They can be derived exactly from what is already
stored: every fileable piece in the conversation's assistant messages
(`pieceKeysInReply`), minus what is in the stack, minus a new per-lesson
`dismissedPieces Json?` (only if teachers need to hide one). Deriving keeps
one source of truth and needs no backfill. If the planner later suggests
pieces outside fenced or step markup, a table becomes worth it.

**The deck leaves the stack (Kevin 7).** It keeps its `slot='deck'` row,
because the chat, Present and PPTX routes all resolve it, so nothing old
breaks. Under stack v3 every stack reader (run of show, time bar, totals,
handouts, plan doc, stack contents for the model) filters out
`kind === 'slides'`. The deck shows only in Take it to class.

## Shared domain code (unit tests first)

These pure modules are the base for everything else. Each lands as its own
commit with its tests.

- **`step-types.ts`**: the seven types, their labels, and the color tokens
  from the brief (tint / text / accent). `stepTypeFor(kind, title)`:
  class-starter → Class Starter, daily-pages → Daily Pages, notes and
  framings → Context, exit-ticket → Closing, thesis kinds → Thesis Essay.
  For a `step`, match the title: /hook|warm|activity|discuss|pair|gallery/
  → Activity; /read( |-)?aloud|reading/ → Read aloud;
  /clos|exit|wrap/ → Closing; /context|background|author|historical/ →
  Context; otherwise Activity. The planner's own `type:` tag (P3) wins over
  the regex.
- **`step-minutes.ts`**: `stepMinutes(material)` is the column, then the
  *filed title's* "(N min)" (never the derived first sentence), then the
  type default flagged as a suggestion (Context 5, Daily Pages 10, Class
  Starter 5, Closing 5, Read aloud 10, Activity 10). The word-bounded
  pattern fixes the "2 mini" match.
- **`stack-timing.ts`**: `stackTiming(steps, periodMinutes)` returns the
  blocks with their start minutes, the total, leftover, the status chip
  text, the writing minutes, the writing % (writing ÷ max(period, total))
  and the source labels ("From Class Starter + Daily Pages"). The header,
  time bar, meter, Run the show, plan doc and chat all use it, which
  replaces `packet.totalMinutes` and `plan-timing.ts` for v3.
- **`time-fixes.ts`**: `timeFixes(steps, period)` returns zero to two
  fixes, and only when over.
  - Fix 1 trims the longest non-writing step by `min(over, minutes − 3)`.
    It is omitted when that step is already ≤3 min. Its copy says what it
    reaches ("Trim Context: The Author to 3 min · gets you to 2 over") when
    it can't fully close the gap.
  - Fix 2 moves a Context step to tomorrow. Pick the smallest Context step
    at least as long as the overage, otherwise the longest. It is omitted
    when there is no Context step.
  - It never returns a fix that touches an isWriting step.
  - Both are deterministic, so the same stack always gives the same fixes.
- **`stack-sync.ts`**: `segmentKeys(messageContent)` maps a step key and
  the fenced block inside it to one **segment id**, so a step that only
  holds a block shares status with that block. `inStack(segmentId, stack)`
  is used by the card, the summary list and Add everything.
- **`plan-steps.ts` end-of-plan cut**: a step body ends at the first of
  - a `---` rule after the last step (the new prompt rule, P2),
  - a paragraph that starts with `Total:` or matches a minutes sum
    (`\d+\s*\+\s*\d+.*=\s*\d+\s*min`),
  - a trailing question paragraph addressed to the teacher ("Want to…?",
    "Would you like…?"),
  - the "You don't have to use all of these" line.

  Tests use Brian's exact reply, so the Closing card ends after the exit
  ticket.
- **`short-title.ts`**: a fence `title:` line wins. Otherwise use the
  first clause, cut at a word boundary under 48 characters, with no
  ellipsis. "Daily Pages: O'Brien lists what every soldier carries — down
  to the ounc…" becomes the model's title, or "Daily Pages: What every
  soldier carries".

## Prompt changes (one commit each, bump `LESSON_PLANNER_PROMPT_VERSION`)

- **P1. Framing line.** A delivered full lesson opens with Brian's exact
  sentence. Belt and braces: the client renders the framing line above any
  reply where `looksLikeLessonPlan` is true, and a server-side
  `stripPreamble` drops a leading line that matches the known preambles
  ("I have everything I need", "Here's the plan", "Got it", "Perfect").
  Tested on the stored reply text.
- **P2. Plan shape.** Every step heading carries a type tag and minutes:
  `## Hook (15 min) {type: activity}`. Framing notes and Daily Pages get
  minutes too. Commentary goes after a `---` rule. Drop the "write the
  total" instruction (L401): the app shows the total now.
- **P3. Fences carry `minutes:` and `title:` lines** (Daily Pages, exit
  ticket, materials). The title is short and real.
- **P4. Wherever the teacher starts** (Brian 13). Don't re-ask what's in the
  first message. Ask only for what's missing (topic, students, period
  length) in one short turn. Then deliver the full lesson. This adds tests
  over three openers: class data, a standard, and day one of a novel.
- **P5. Stack commands** (for the stack chat; a separate small prompt, see
  B7).
- **P6. Templates** (T2): when a template is attached, fill each slot with
  a piece of that type and length, and offer one alternative per slot,
  never a list.
- **P7. Deck from the stack.** One slide per stack step, in order. The hook
  slide carries its directions, pair-share question and landing line. Never
  include a step that isn't in the stack.

## Work items

### Phase 0: correctness the teacher can see today (stack v2, small)

These fix the wrong times and leaked text on the *current* pages too, so
Brian sees them on the next preview even before v3.

- **0.1 Times from the filed title, never the first sentence**
  (`lesson-packet.ts` L297): use `step-minutes.ts`. Tests: the hook stays
  15. The header for Brian's stack reads 50.
- **0.2 Commentary cut** (`plan-steps.ts`): the end-of-plan cut. Existing
  stacks with leaked text get cleaned on read, because the packet re-reads
  the piece from the reply when `editedAt` is null; edited pieces are left
  alone.
- **0.3 Minutes on every filed piece**: `add-material` applies
  `blockMinutesInReply` like `fileReplyPieces` already does, and writes
  `minutes` (M1) plus the title suffix (dual-write).
- **0.4 Short titles** everywhere a prompt-based title is shown.
- **0.5 Handout panel bug**: remove the absent-student link from inside
  the handout view (`packet/route.tsx` L525).
- **0.6 Lesson plan has no duplicate Closing** (`lesson-plan-doc.ts`): when
  the stack has a Closing-type step, it *is* the Closing section and is not
  repeated as an instruction. The same goes for an opening hook or class
  starter as the Opening. With no closing, show "Suggested closing: not in
  your stack." Times come from `stackTiming`.

E2E (`teacher.lesson-planner-run-3.spec.ts`, new): seed Brian's reply and
stack, then assert the header reads 50 min, the hook shows 15, Daily Pages
and framing notes have times, the Closing card has no "Total:" or question,
and the handout panel has no absent-student link.

### Phase 1: the planner chat (stack v2)

- **1.1 Add to stack on every segment** (Brian 1). In `MessageBubble`,
  when a reply is a plan, split the markdown at the step headings
  (`readPlanSteps` ranges). Render each heading as a step header with its
  minutes and an Add to stack / In the stack toggle (`data-testid=
  "segment-toggle"`). The body renders as before, with fenced cards inside
  it. A step that only holds a block shows one toggle for both (segment
  id). The "Steps in this plan" list stays.
- **1.2 One status everywhere, two-way sync** (Brian 2).
  - The chat's `addedMaterials` is rebuilt from the server after every
    stack mutation, on `visibilitychange`/focus, and on a
    `BroadcastChannel('yawp-lesson-stack:<id>')` message that the stack
    page and the side panel post after each write.
  - Toggles, the summary list and Add everything all read
    `inStack(segmentId)`.
  - Add on something already in the stack does nothing and shows "In the
    stack · Remove".
  - Add everything files only what's missing (keep-all already skips by
    slot; the test adds the step/block overlap case).
- **1.3 Framing line** (P1).
- **1.4 Create in YAWP! on every writing step** (Brian 4).
  - Extend `stack-create-link.ts` to exit tickets written as prose inside a
    Closing step (filed as their own exit-ticket piece by 0.2's split),
    quick writes (a `step` with a writing prompt → Daily Pages type), and
    Thesis Essay modules (`thesis_statement`/`prewriting` kinds, label
    "Thesis Essay · Module N").
  - A class starter with three prompts opens a small pick (three radio
    rows, then Create) before going to the sheet.
  - The return trip: the assignment create flow already has `fromLesson`.
    Add `fromMaterial=<id>`. On save, write `yawpAssignmentId` /
    `yawpCreatedAt` (M1) and redirect back.
  - The button becomes "Created in YAWP! · Open", in chat and on the stack.
  - Tests: unit for link building; route test for the write-back; e2e for
    the three states.
- **1.5 Picks up wherever the teacher starts** (P4). Prompt tests only;
  the intake card is unchanged.

E2E: the hook card toggles. Adding from the card marks the list item.
Removing on the stack page (in a second page) flips the chat back within
one focus. Add everything twice files nothing new. The exit ticket in
Closing has Create, then shows Created · Open.

### Phase 2: the new stack page (stack v3)

A new route module under the same URL. The packet route's loader checks
`stackV3` and renders `StackPageV3` from a new folder,
`routes/app.lesson-planner_.$conversationId.packet/v3/`. The old page is
untouched. Fonts load only on this route (and Run the show) via its
`links()`: Google Fonts for Bricolage Grotesque and Instrument Sans. Colors
are scoped CSS variables on a `.stack-v3` root (page `#F6F1EA`, card
`#FFFDF9`, ink `#1C1A17`, primary `#A8482A`, the type tokens, and writing
`#7B4FB0` / `#F4EEF9`), so nothing leaks into the app theme. No dark mode
for v1 (the app has none on this page).

- **2.1 Loader and actions.** A `loadStackV3` returns the steps (deck
  filtered out), `stackTiming`, `timeFixes`, set state, suggestions (K7),
  outputs and flags. New packet API intents:
  - `set-minutes` `{id, minutes}`: clamps 1–120 and dual-writes the title.
  - `apply-fix` `{fixId}`: recomputes on the server and refuses when stale.
  - `move-to-tomorrow` `{id}`: writes M4 and removes the step from this
    stack.
  - `set-lesson` / `unset-lesson`.
  - `save-template`.
  - `add-piece` `{segmentId, beforeId?}`: positions it.
  - `stack-command`.
  Reorder, remove and edit reuse the existing intents.
- **2.2 Header** (Kevin 1): Back to planning, the save indicator (driven by
  the fetcher state: "Saving…", "Saved", "Lesson set · saved"), In your
  library (the existing publish). Title, then chips: class/period
  (`lessonClassLabel`), date (`lessonDate`, editable), period length
  (editable; writes `periodMinutes`).
- **2.3 Time bar, status chip, writing line** (Kevin 1, 5). One `div` row;
  each block's flex-basis is minutes ÷ max(period, total). A striped
  leftover block. A 3px purple line under writing blocks. Clicking a block
  scrolls to and opens its card. No drag on the bar.
  `aria-label="Planned 50 of 50 minutes"`, and the blocks are buttons with
  the step name and minutes.
- **2.4 One-tap fixes** (Kevin 1; Brian 10): the box from `timeFixes`,
  "You're N min over. Two ways to get back on time:", each with Apply, and
  the footnote "Fixes never cut writing time." Apply is undoable (the same
  toast as the commands).
- **2.5 Writing strip and meter**: "N% of class is writing · N min", the
  sources, a meter.
- **2.6 Run of show cards**: a compact row with start minute, handle, type
  chip (with label, e.g. "Thesis Essay · Module 1"), Writing badge, title,
  − / + stepper (1-min steps, writes `set-minutes`, debounced 400 ms), up /
  down, remove (the existing 6 s undo). Opened: an excerpt (first ~240
  chars of the student-facing text), "Has a handout", Edit this step (the
  existing rich editor in a sheet), "Rework it in the planner" (back to the
  chat with a prefilled message naming the step), and Create in YAWP! for
  writing steps. Drag uses the existing native DnD from `stack-list.tsx`.
- **2.7 Insert points and the Add a piece panel** (Kevin 2).
  - A hover "+" line between cards (also reachable by keyboard on focus)
    and "Add another piece from the planner" at the end.
  - The panel is a right sheet. Its header reads "Goes in at minute N,
    after …", with current minutes vs the period and a close button.
  - **From your conversation**: the derived suggestions, each card showing
    type, Writing badge, minutes, title, one line and the impact line
    (computed with `stackTiming` on the would-be stack), plus Add.
  - **Ask the planner**: a mini input. It posts to the planner API with a
    `mode: 'pieces'` hint, and the reply must be fenced pieces only. They
    render as the same cards. The message is stored with `surface: stack`
    (M5).
  - Drag a card into the run of show: "Drop here" slots appear between
    every step, and the one under the pointer grows and turns coral.
  - After an add, the new card opens and the insert point moves after it.
  - Footer: "Continue in the planner →".
- **2.8 The stack chat** (Kevin's note; Brian 7). This is the Add panel's
  Ask the planner input ("Describe what you need…"). The panel's header
  copy changes when no insert point is chosen. It also opens from a small
  "Ask the planner" button beside Run of show, so the teacher can make a
  change without first picking a spot.
  - The server calls the planner model with P5: the stack as JSON and the
    teacher's line. It returns **one structured result**: a list of
    operations (`set_minutes`, `rewrite_step {id, content}`, `rename`,
    `move`, `remove`, `add_from_suggestion`, `propose_piece`) plus a
    confirmation of at most 12 words. `propose_piece` is how 2.7's "Ask
    the planner" returns a card, so one endpoint serves both.
  - The server applies the operations in one transaction and returns an
    undo token (a snapshot of the touched rows).
  - The UI updates the cards and total, then shows "Hook shortened to 10
    min · Undo" until the next change. If the line isn't a stack change
    ("why does this work?"), the reply is "That's a planner question. Open
    it in the planner →", with nothing applied.
  - Both lines are stored with `surface: stack` in the same conversation,
    and the planner chat shows them as compact "Stack change: …" rows.
  - A deterministic fast path parses "shorten/lengthen/make X N minutes"
    without the model (unit-tested), for speed and cost.
  - Tests: unit tests for operation validation (unknown ids, writing-step
    content stays a writing prompt), a route test for apply and undo, and
    an e2e with a stubbed model response.
- **2.9 Finish line** (Kevin 1).
  - "Ready for Monday?" (the weekday comes from `lessonDate`), with one
    status line: "Right on time · 38% writing", or "6 min over: fix it or
    set it anyway".
  - "This lesson is set" writes `setAt`, then shows "Lesson set for Mon,
    Oct 19" with the three stats.
  - Run the show (Phase 4; hidden without its flag).
  - Save this shape as a template (Phase 5; hidden without its flag), with
    an inline name field prefilled "Day one: novel opener (50 min)".
  - Keep editing clears `setAt`.
  - Editing a set lesson unsets it? **Decision K8** (default: edits are
    allowed and the header shows "Lesson set · edited since", no
    auto-unset).
- **2.10 Take it to class** (Kevin 1; replaces "When the sequence is set"
  on v3).
  - Lesson plan: Word / Google Docs / PDF (Phase 3.2).
  - Slide deck: "Build the deck" (the existing `?build=deck`), or Open /
    Present / PowerPoint once one exists.
  - Student handouts: Print / PDF (Phase 3.1).
  - Full packet PDF link.
- **2.11 First-open line**, dismissible, remembered per teacher (a user
  setting row, so it survives devices).

E2E (run-3 spec, `stack v3 on`): the header sums the steps. The bar has a
block per step and a striped leftover. − on the hook changes the total and
the chip. Adding all three framings shows "N min over" and two fixes;
Apply on fix 1 trims the longest non-writing step; Undo restores it. Fix 2
moves the Context step and a new lesson for that class shows it at the
top. The writing meter reads the right percent. Add a piece: insert between
cards, the placeholder shows, the From your conversation card adds in
place, and the insert point moves. Dragging a card in works. The stack
chat (stubbed) changes the hook to 10 with one line + Undo. Set / Keep
editing. The deck is not in the run of show and is in Take it to class.
With v3 off the old page renders unchanged (the existing specs keep
passing).

### Phase 3: what goes out of the room

- **3.1 Handouts for any step** (Brian 8).
  - "What goes in this handout" lists every step. Student-facing and
    writing steps are checked by default; the others are listed and
    unchecked. Every step keeps "Download alone".
  - A teacher step gets a **student version** on first use: one model call
    per step content hash, cached in a new `studentVersion` text on the
    material (part of M1). It is written to the student, with no teacher
    moves. Writing steps get answer lines sized to the task (lines = a
    words estimate ÷ 10, clamped 4–20).
  - Framing notes become a one-page background sheet. The closing becomes
    an exit slip (two to a page).
  - `hasHandout` is true once a student version exists or the step is
    student-facing.
  - Audience variants (families, subs, missed class) come through Send
    this lesson (3.4), not here.
- **3.2 Lesson plan document** (Brian 12, flag plan export v2).
  - The stack decides the sections.
  - Step titles become Heading 3 (real styles); Title and sections stay
    Heading 1/2. No text boxes or locked runs.
  - Times come from `stackTiming`.
  - Optional blank sections, each with one italic instruction line:
    Standards, Learning objectives, Materials, Differentiation /
    accommodations, Assessment. Assessment is prefilled from the exit
    ticket or Daily Pages when one is in the stack.
  - The format choice: one button opens a two-option pick, "Word document"
    or "Google Doc". In v1 Google Doc downloads the same .docx and opens
    `https://docs.google.com/document/u/0/` in a new tab with three numbered
    steps on the page (Decision K3). It is checked by eye in LibreOffice and
    Google Docs import.
- **3.3 Slide deck from the stack, new brand** (Kevin 7; Brian 1, 14).
  - The deck is built from the stack in order (P7). A deck that's out of
    date versus the stack says "Your stack changed since this deck · Rebuild".
  - The brand: make `tile-theme.ts` a `DeckBrand` object (colors, fonts,
    footer) consumed by both renderers, and add the new brand behind
    `deck_v2` once its values arrive (K4). Until then the structure lands
    with today's tokens.
- **3.4 Send this lesson** (flag share): Substitute / Student / Family /
  Admin tabs. Each sets the recipient field label, the "What they get"
  checklist defaults, the note label ("Special instructions for your sub"
  for subs) and the button text ("Send sub plan").
  - "We rewrite it for whoever is reading": one model call per audience
    and stack version, cached like the plan summary.
    - The sub plan gives exact times and what to say, with no teacher
      shorthand.
    - The family note is plain language: what we did and how to help.
    - The admin version is the lesson plan plus its standards.
    - The student version is the make-up handout.
  - The class roster item needs the lesson tied to a real class (K6); it is
    hidden when the lesson has only a class label.
  - Sending emails a share link (M6) through the existing Resend path
    (captured in previews).
  - The sub note appears at the top of the sub's plan view.
  - The Student tab produces the make-up handout (the existing
    `?build=makeup` text, generalized beyond the class starter and Daily
    Pages).
- **3.5 Post to your class** (flag share): checkboxes for what the link
  opens (the slides, handouts, the Daily Pages prompt…), then a share link
  (M6).
  - "Share to Google Classroom" opens
    `https://classroom.google.com/share?url=<link>`, the public share
    button URL, with no OAuth.
  - Canvas, Schoology and Teams copy the link with a one-line how-to.
    Teams also uses its share URL (`https://teams.microsoft.com/share?href=`).
  - Copy link.
  - The link opens a read-only public route
    `/l/:token`. It needs no login, shows only the checked items, and has
    no teacher notes.
  - Tokens are 32 random bytes, stored hashed, revocable from the card.
    The route never lists other lessons. It has a security-focused route
    test.

### Phase 4: Run the show (flag run show)

- New route `/app/lesson-planner/:conversationId/show`, dark (`#1C1A17`,
  panels `#2A2622`), same fonts.
- Top bar: Exit show, the lesson name and period, the Clock control
  (Off / Stopwatch / Countdown; Off by default; remembered per teacher), and
  "Slides on the projector · following you".
- Left rail: done / current / upcoming steps, purple dots for writing.
  Click to jump.
- Now card: step number, type chip, Writing badge, big title, the notes
  (the step's teacher text), and a thumbnail of the current slide
  (`TileSlideCanvas` small).
- Stopwatch: time in the step plus time into class. Countdown: time left
  plus a progress bar. Overtime is calm amber ("past the plan. No rush."),
  never red or flashing. An optional 2-min heads-up shows on this screen
  only.
- Up next, Back, a big Next step. The end: "That's the show." with Back to
  your lesson and Run it again for Period N (the period chip is
  editable).
- **Slides follow**: the projector window is the existing Present route,
  opened from the show. The two windows talk over
  `BroadcastChannel('yawp-show:<id>')`, so they must be on the same
  computer. Step → slide uses the deck's slide-to-step mapping (P7 records
  `stepId` on each slide; for older decks, map by order and title).
- **Phone as remote** (not mocked): later. It needs a server channel (SSE
  plus a short pairing code). It is not in this wave.
- E2E: the clock modes, overtime styling class, Next advances, rail jump,
  the end screen, and the projector page receiving the step change (two
  pages, one context).

### Phase 5: Templates (flag templates)

- **T1. Save this shape as a template** (stack Finish line): the name is
  prefilled; it writes M3 with `(type, minutes, label)` per step, no
  content.
- **T2. Build from my templates tile** on the planner start screen,
  second after "Plan a lesson". Clicking it lists Your templates under the
  input: name, shape ("Starter · Activity · Context · Daily Pages ·
  Closing"), length, a small time bar with the purple writing line, and %
  writing. Picking one puts a "Using your template: …" chip (with ×) in
  the input and changes the placeholder to "What are we reading?…". The
  send carries `templateId`, and the server adds the slots to the system
  prompt tail (P6). The other start tiles keep their real copy (the stand-in
  descriptions in the mockup are not used).
- E2E: save, the list shows the bar, pick → chip, send includes the
  template, × clears it.

### Later (named so it isn't lost)

- Writing minutes across lessons: weekly, unit and class totals (needs a
  class id on lessons, see K6).
- Phone as remote for Run the show.
- Real Google Doc creation and a Google Classroom post with Drive/Classroom
  consent.
- An "In the stack" status for pieces filed from older whole-reply keeps
  (they show as one item today; "Split into pieces" covers them).

## Sequencing

1. Phase 0 (one preview redeploy, so Brian sees right times and clean
   cards on the current page).
2. Phase 1 (the chat-side asks; the biggest part of Brian's list).
3. M1, M2 and the shared domain code; then Phase 2 (the new page), in
   order 2.1 → 2.6, then 2.9 → 2.10, then 2.7, then 2.8.
4. Phase 3.1–3.3, then 3.4–3.5 (they need M6).
5. Phase 4 and Phase 5 in either order.

Each phase ends with every planner e2e suite green together (the original
spec with all flags off) and typecheck clean, then a preview for Brian.

## Decisions for Kevin (defaults taken if unanswered)

- **K1. "When the sequence is set"**: Brian asked to keep it as is.
  Default: the new page carries the same four outputs in Finish line + Take
  it to class, and the old panel stays on the old page.
- **K2. Back link wording**: default "Back to planning", with the subline
  "Your chat, with this stack saved".
- **K3. Google Doc**: default v1 is a guided upload (the .docx plus "Open
  Google Docs" with steps). The real thing needs Google Drive consent
  (`drive.file` scope) and OAuth verification, so it is later.
- **K4. Deck brand**: the design boards PDF covers the stack page, not the
  slide deck. Brian's deck brand link hasn't reached this session.
  Default: build the `DeckBrand` structure now and apply the values when
  you paste the colors/fonts/footer or share the link from this
  organization.
- **K5. When a step counts as writing**: default by kind (class starter,
  Daily Pages, exit ticket, Thesis Essay module), even before it's created
  in YAWP!, plus any step with a created YAWP! assignment. A quick write
  written as prose counts once it's created in YAWP!, or right away if the
  planner tags it `{type: daily_pages}`.
- **K6. "Tomorrow" and "next lesson"**: lessons carry a class label, not a
  class id. Default: the carry-over goes to the next lesson created for the
  same class label (or the next unit day, when the lesson is in a unit),
  and shows at the top as "Moved from Mon, Oct 19". Adding `classId` to
  lessons is the better long-term key, and the writing totals need it.
- **K7. Unadded suggestions**: default derived from the conversation, not
  stored.
- **K8. Editing a set lesson**: default edits are allowed, the header shows
  "edited since set", and it doesn't auto-unset.
- **K9. The stack chat's model**: default the planner's model with a small
  structured-output prompt, plus the deterministic fast path for minute
  changes.
- **K10. One input or two**: the boards show only Ask the planner in the
  Add panel. Default: that one input handles both kinds of request (it
  adds pieces as cards, and applies changes with one line plus Undo), with
  an "Ask the planner" button beside Run of show so it opens without an
  insert point. The alternative is a separate command bar at the bottom of
  the page, which the boards leave out.

## Open questions for Brian on the next run

- Do the two fixes cover what he'd reach for, or does he miss "keep one
  framing note"? (The stack chat can do it.)
- Default handout checks for a hook: checked or not?
- Does Run the show's countdown feel calm enough?
- Wave 2 items still unchecked: internal codes hidden, swap flow, stack deck
  card Edit, YAWP! spelling everywhere, the stack side panel while
  chatting.

## How it will be checked

- Tests first, as above. A new e2e spec, `teacher.lesson-planner-run-3.spec.ts`,
  with each flag on and off where it matters. All planner suites run
  together.
- Unit tests for every shared module (timing, fixes, types, minutes,
  sync, the end-of-plan cut, short titles, command operations, share
  tokens).
- Six migrations, each with a rollback, listed in the migration order
  test.
- Checked by eye on the preview: the stack page against the canvas, Run the
  show on a laptop plus a second window, the Word file in Word, LibreOffice
  and Google Docs, and a share link in a private window.
