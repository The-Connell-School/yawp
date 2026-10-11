# Lesson Planner: Brian's review, turned into work

Source: five note files from Brian's test session on the demo space (the
"Things They Carried" lesson): `session-log.md`, `session-log-screenshot-07.md`,
`session-log-day-one-plan.md`, `slide-deck-style-notes.md`,
`lesson-planner-personality.md`. Every concern in those notes maps to a numbered
change below. Nothing here is built yet.

All code paths are under `services/web-app/app/` unless they start with
`packages/` or `services/`.

## The thread through everything

Brian's notes come back to one principle: **the teacher is in charge.** Four
consequences, which the work packages below follow:

1. **Ask one decision at a time, and never guess an answer.** Class, length,
   then how to fill the time. Options come from what the teacher really
   teaches, and every combination must be possible.
2. **The stack is the lesson.** Every piece the planner offers can be taken on
   its own; the deck, handout and printed plan are built from whatever the
   teacher kept, not from the whole chat.
3. **Offer, never prescribe.** Framings as options, "if you like…" on every
   pedagogical move, three exit tickets not one, and a voice that teaches new
   teachers while affirming veterans.
4. **Help the teacher finish and leave.** One clear invitation to build the
   stack, one closing question, a celebration, no moving goalposts.

## Where the code is today

| Area | Current behavior | Code |
| --- | --- | --- |
| Intake rules | Prompt tells the model to learn grade/course, length and skill level "in one short batch", to call `list_classes`, and to write chips with real class names. Nothing enforces any of it. | `routes/api.domain.lesson-planner/build-system-prompt.ts` L254–259, L489–517 |
| Where class options come from | Only from the model calling `list_classes` (`domain/reporter/reporter-tools.server.ts` L374) and then *writing chip text itself*. No class list ever reaches the UI. | `domain/lesson-planner/lesson-planner-tools.server.ts` L68 |
| Chips | Free text in a ```` ```suggestions ```` fence, parsed client-side; `withoutPeriodLength` strips "50 minutes" clauses, nothing strips a grade+scope pairing. | `domain/lesson-planner/suggestions.ts` L124–284, `routes/app.lesson-planner/route.tsx` L1033–1080 |
| Slider / 50 min | `yawp-ask` fence with `minutes: N`; `DEFAULT_MINUTES = 50` when the model gives no number. Slider starts at that value. | `domain/lesson-planner/lesson-ask.ts` L22, L104; `components/ai-chat/lesson-ask-card.tsx` L73–85, L157–175 |
| Expanding card + Send summary (Brian: keep) | `LessonAskCard` steps note → minutes → activities; `composeAskReply` builds the sentence. | `lesson-ask-card.tsx`, `lesson-ask.ts` L193 |
| Plan output | Markdown + tagged fences, split client-side by `splitReplyParts`. No plan schema. | `domain/lesson-planner/reply-parts.ts` |
| "Add to stack" per piece | Exit tickets (`ExitTicketCard`), materials, deck have it. **Class starters / Daily Pages (`DailyPagesCard`) do not**: no `added`/`onToggle` props, and `artifactFromAssistantReply` has no branch for `yawp-daily-pages`. | `components/ai-chat/daily-pages-card.tsx`; `domain/lesson-planner/artifact-from-reply.ts` L32–57; `routes/app.lesson-planner/route.tsx` L1104–1131 |
| "Add all of this" / "Add all as a handout" | `keep` intent with audience teacher/student on *any* reply, including intake turns. | `route.tsx` L1224–1261; packet route L339–363 |
| Stack screen | View switch, print/PDF, rename, per-section rename/edit. **No remove control**; handout checkboxes are client-only. | `routes/app.lesson-planner_.$conversationId.packet/route.tsx` |
| Lesson name | `deriveTitle` = teacher's first message, cut at 57 chars; renamed to the first plan heading on the first plan reply (`shouldRenameLesson`), unless the teacher set `packetTitle`. | `routes/api.domain.lesson-planner/route.ts` L168–172, L498–504; `domain/lesson-planner/lesson-name.ts` |
| Build from stack | None. Stack contents reach the model only as `kind · title · slot` inventory lines. | `build-system-prompt.ts` L39–51; `route.ts` L357 |
| Next-step chips | `FOLLOW_ON_SUGGESTIONS` pinned under any plan-looking reply unless the stack already holds that piece. | `suggestions.ts` L30–33, L262–283 |
| Deck | Model writes `yawp-slides` JSON (8 layouts); zod-validated; one LLM repair pass; duration = sum of per-slide `minutes`; subtitle ("English 11") is model text. | `domain/lesson-planner/slide-deck.ts`, `repair-slide-deck.server.ts` |
| Deck look | pptxgenjs with hard-coded colours, one function per layout, no master/footer/logo/slide numbers. HTML presenter uses Tailwind slate. | `domain/lesson-planner/lesson-pptx.server.ts`; `routes/present.$conversationId.$messageId/slide-canvas.tsx` |
| "Phantom YAWP" footer | String not in the repo. No footer is rendered by pptx or HTML. Confirm with Brian which deck he saw (see Inconsistencies). | — |
| Deck editing | None structured. `MaterialRichEditor` edits the deck's Markdown `content` if it is filed. | `packet/route.tsx` L476 |
| Deck card | "Add to stack / In the stack", "PowerPoint", "Present". | `components/ai-chat/slide-deck-card.tsx` L53–97 |
| Memory / library | No tool reads saved lessons, stacks or past chats. Context is this conversation's bounded history + inventory. | `lesson-planner-tools.server.ts` |
| Persona | "Who you are" is instructional-design expertise only; no guidance on pushback, personal questions, badmouthing students, celebration, or accuracy. `teacherName` is always `null`. | `build-system-prompt.ts` L245–252; `route.ts` L350–361 |
| Flags | `Setting` row `feature_flag.<key>` with off / everyone / targeted. Registry in `domain/feature-flags/feature-flags.ts`; server `isFeatureFlagEnabled`; client via root loader data. | `feature-flags.ts`, `feature-flags.server.ts`, `root.tsx` L222–233 |
| Tests | Unit co-located `*.test.ts` (`bun test app/`). E2E `e2e/tests/teacher.lesson-planner.spec.ts` seeds canned assistant messages into `lessonPlanConversation`; the LLM is never called. | `e2e/README.md` |

## Ground rules for execution (from AGENTS.md)

- TDD: e2e first for UI/flow changes, unit tests first for domain/server changes.
- Backward compatibility: anything that replaces current behavior goes behind a
  flag; old behavior stays until the new one has run in production a couple of
  weeks. Flags proposed here: `lesson_planner_intake_v2` (A), `lesson_planner_stack_v2`
  (B), `lesson_planner_deck_v2` (E). Prompt-only changes (C, D) ship as a prompt
  version bump without a flag, since the old prompt cannot be "kept" alongside
  a new one; keep them in separate commits so any one can be reverted.
- Small atomic commits, one change each. No push unless asked.

---

## A. Intake: one decision per step, from the teacher's real classes

Brian: *"Ask about class and length before asking how to teach the content.
Each question should have only one decision in it, and the options should not
assume the answer to a different question."* Keep the expanding card and the
Send summary ("pretty cool").

### A1. Server supplies the teacher's classes to the ask card

**Fix.** The class list stops being something the model writes and becomes
something the app renders. Add a `classes` control to the `yawp-ask` fence:

```yawp-ask
classes
minutes
```

The planner loader (`routes/app.lesson-planner/route.tsx` L93–245) loads the
teacher's non-archived classes (same query as `listClasses`, factor it into a
shared helper in `domain/reporter/reporter-tools.server.ts`) and passes
`teacherClasses: {id, title, grade, period}[]` to the page. `LessonAskCard`
renders them as checkboxes (multi-select, per Brian's step 1).

- **One class:** pre-check it and collapse the step to a single line ("For
  English 11 · Period 3"), so the teacher is not asked.
- **No classes on the account:** fall back to a short free-text field ("Which
  class is this for?") in the same card. Never show grade guesses as chips.
- **Prompt:** replace "If you called list_classes, use their real class names"
  with: ask with the `classes` control, never write class or grade names into
  suggestions, never guess the grade.

**Code.** `lesson-ask.ts` (`readLessonAsks`: new kind `classes`; `composeAskReply`:
"For English 11 · Period 3."), `lesson-ask-card.tsx` (new first step),
`route.tsx` loader + `MessageBubble` plumbing, `build-system-prompt.ts` L489–517.

**Tests first.** `lesson-ask.test.ts`: parses `classes`, composes the sentence
for one / several / zero classes. `build-system-prompt.test.ts`: prompt names
the control and forbids grade chips. E2E: seed an ask turn with `classes` and
two seeded classes → checkboxes with the real titles; with one class → no
step shown and the summary names it.

### A2. Length per class, with no pre-filled default

Brian: the 50 looks like a default and the teacher never said it; the same
class can meet for different lengths.

**Fix.** When `classes` and `minutes` are both asked, render one slider per
checked class, labelled with the class. Sliders start **unset**: the thumb
is hidden/greyed and the value reads "Set the length" until touched; Send is
disabled until every checked class has a length. `composeAskReply` yields
"English 11 · Period 3, 90 minutes. English 10 · Period 5, 50 minutes."

- Keep the model's `minutes: N` as an optional *hint* (shown as "Usually 50?"
  tap-to-accept) only when it came from real data; otherwise drop
  `DEFAULT_MINUTES`.
- **Remember it:** add nullable `Class.periodMinutes` (migration, additive) and
  write the last-used length per class when the ask is sent; prefill from it
  next time (that is real data, so prefilling is fine). Dual-write nothing else;
  this is a new column with no old equivalent.

**Code.** `lesson-ask.ts` (`DEFAULT_MINUTES` only behind the old path),
`lesson-ask-card.tsx`, `packages/prisma/schema.prisma` (`Class.periodMinutes`),
a small action on the planner route to persist it.

**Tests first.** Unit: no default when unset; per-class composition. E2E:
update 'asks for the lesson length on a spectrum…' (L2530, currently asserts
`50 min`) to assert the unset state and disabled Send under the flag; add the
two-class case.

### A3. "How do you want to fill the time?" as its own single-choice step

Brian: chips paired "11th grade" with "just the opening pages"; the teacher
could not pick 11th grade + whole story.

**Fix.** A third control, `choose`, carrying the model's content-specific
options as a single-choice list rendered *after* classes and length:

```yawp-ask
classes
minutes
choose: Read the whole first story together
choose: Just the opening pages, enough to hook them
choose: As much as we can, assign the rest for homework
```

Plus an always-present "Something else" that opens the free-text box. Prompt:
on the intake turn, scope/reading-plan options go in `choose:` lines, never in
`suggestions`; the `suggestions` fence on that turn is reserved for whole
answers that do not name a class, grade or length. Client guard: when an ask
card is shown, hide the `suggestions` chips entirely (today they move inside
the card, L1275–1282); the card's own steps are the choices.

**Code.** `lesson-ask.ts`, `lesson-ask-card.tsx`, `build-system-prompt.ts`,
`route.tsx` L1275–1300.

**Tests first.** Unit: parse `choose:` lines, order of steps, "Something
else" composes free text. E2E: card shows class → length → choice; summary
line reads all three; Send carries one message.

### A4. Intake prompt rewrite

Rewrite "How you work" L254–259 and "Asking with controls" L489–502 into the
three-step order, one decision per turn, with the controls above. Keep the
"never ask minutes on the opening turn / in a plan reply" rules. Bump
`LESSON_PLANNER_PROMPT_VERSION`.

**Open for Kevin (recommended default in bold):**
- Does a teacher with one class skip step 1? **Yes, show it as a line, not a
  question.**
- Remove the 50 or show unset? **Unset, with the remembered per-class length
  prefilled once we have one.**
- Class + scope as separate fields in one card? **Yes (A1 + A3), same card,
  same Send.**

---

## B. The stack is the lesson

Brian: *"That's really necessary just for the teacher's control here."*

### B1. "Add to stack" on class starters and Daily Pages (and essays)

**Fix.** Give `yawp-daily-pages` blocks a `blockKey` (`dp`, `dp:1`, `dp:2`,
≤ 8 chars to fit the packet API's `materialKey` cap) in `reply-parts.ts`,
mirroring exit tickets (L83–87). Add `dailyPagesAsMaterial` and a branch in
`artifactFromAssistantReply`. Extend `MATERIAL_KINDS` with `class-starter` and
`daily-pages`; store the `promptId` in the material content header so the
stack screen can still offer "Create this … for your class". Give
`DailyPagesCard` `added`/`onToggle` and wire it in `route.tsx` exactly like
`ExitTicketCard` (L1117–1131). Update `packetKindForMaterial` /
`lessonHas` so a filed starter counts as a handout-type piece where that
matters. Do the same for `yawp-practice` if an essay/practice block appears.

**Tests first.** `reply-parts.test.ts` (keys), `artifact-from-reply.test.ts`
(resolves `dp:1`), packet route test (`add-material` with `dp`), E2E: 'offers
three warm-ups…' (L2767) gets an "Add to stack" toggle per starter and the
stack banner count increments.

### B2. Remove from the stack screen

**Fix.** On the stack screen each section gets a trash control (visible on
hover/focus, always visible on touch) that calls `remove-material` (materials)
or `drop` (kept replies). Show an "Removed · Undo" toast for 6 s rather than a
confirm dialog. Add a context-menu entry if `onContextMenu` is cheap; do not
block on it.

**Code.** `packet/route.tsx` sections L440–510; existing intents in packet
route L223–363.

**Tests first.** E2E: file two pieces, open the stack, remove one, count drops,
Undo restores it.

### B3. Tooltip on "In the stack"

**Fix.** `title`/tooltip "Click to remove from stack" on the toggle in
`slide-deck-card.tsx` L62–78, `material-card.tsx` L90–104,
`exit-ticket-card.tsx` L116–130, and the new `DailyPagesCard` toggle. Use the
existing tooltip component if there is one; otherwise `title` + `aria-label`.

**Tests first.** E2E asserts the accessible name/tooltip on an added card.

### B4. "Add all of this" / "Add all as a handout"

Brian cannot think of a case for stacking the whole chat; the two labels are
unexplained. Kevin decides. **Recommendation:**

- Show the whole-reply controls only on replies that pass
  `looksLikeLessonPlan` (never on intake turns, which is where Brian got
  bitten).
- Relabel "Add all of this" → "Add the whole lesson to the stack".
- Remove "Add all as a handout" from the chat. The stack screen already has a
  Student handout view with per-piece exclusion; building a handout is a
  stack-side output (B6). Keep the `keep` intent and `keptAudience` column
  (backcompat: old rows still render), just stop offering it in the chat.

Behind `lesson_planner_stack_v2`; the old buttons remain when the flag is off.

**Tests first.** E2E: intake reply shows no whole-reply controls; plan reply
shows the relabelled button; existing 'puts one material in the packet…'
(L1865) still passes with the flag off.

### B5. Lesson name default

Today the raw message shows only until the first plan lands (then
`shouldRenameLesson` renames to the plan heading). B4 removes the main way a
teacher reaches the stack screen before that. Remaining fix: when the name is
still the derived first message, the stack screen "Lesson name" input shows it
as a **placeholder**, not a value, with helper text "We'll name it from your
plan, or type one". Also ask the model, in the plan-format section, to open
every plan with a specific H1 that works as a lesson title (it already rejects
generic ones).

**Open for Kevin:** teacher-typed, blank, or planner-suggested? **Planner
suggests from the plan heading, teacher can overwrite (current mechanism), and
the raw message is never shown as a committed name.**

### B6. Build outputs from the stack

The big one. Brian: from six steps, a teacher keeps four and builds a lesson
from only those.

**Fix, in two parts.**

*Server:* when the teacher asks for a deck, handout or printed plan and the
stack is non-empty, the prompt includes the stack **contents** (not just the
inventory lines) under a heading "Build from exactly these pieces, in this
order, and nothing else", with the total minutes of the kept sections. Extend
`buildInventorySection` (or add `buildStackContentsSection`) in
`build-system-prompt.ts`; load contents in `route.ts` L350–361 from
`loadLessonPacket`. Tell the model the deck's per-slide minutes must sum to the
stack's total (fixes the "60 min" deck for a 90-min plan when built from the
stack).

*UI:* on the stack screen add "Build a slide deck from this stack" and "Build
a lesson plan from this stack" (the latter = the existing Full plan view +
Print/PDF, surfaced as the primary action). The deck button posts a chat turn
("Build the slide deck from what's in my stack") and navigates back to the
chat, so generation stays chat-driven and the deck card lands in the
conversation as it does today. In the chat, when the stack is non-empty, the
pinned chip reads "Build the slide deck from the stack" instead of "…for this
lesson" (`suggestions.ts` L30–33).

**Tests first.** `build-system-prompt.test.ts`: contents section present only
when asked for an output and the stack is non-empty; `route.test.ts`: stack
contents loaded; E2E: stack screen button sends the message and returns to the
chat; chip label switches once a piece is filed.

**Open for Kevin:** should building from the stack *replace* the deck already
in the stack (slot `deck`)? **Yes, same slot, with the existing
`confirmReplace` 409 path if the teacher had hand-edited it.**

---

## C. The plan itself: offer, never prescribe (prompt work)

All in `build-system-prompt.ts`, each its own commit, each with a
`build-system-prompt.test.ts` assertion on the wording, plus an updated
canned-reply e2e seed where the UI changes.

### C1. Framing options as individually stackable pieces

Brian: historical context, literary context (metafiction), the author, as
choices.

**Fix.** No new block type. Instruct the model: when a step frames the text,
offer two or three framings, each as its own `yawp-material` with
`kind: notes`, slots `frame-hist`, `frame-lit`, `frame-auth`, written as
lecture notes that equip the teacher (3–5 points + one question to leave on
the board). `MaterialCard` already has Add to stack. The step text in the plan
names the options in one line and says "pick one or stack a couple".

### C2. Qualify every pedagogical move

**Fix.** New prompt section "Offer, don't prescribe": every method suggestion
(read-aloud format, think-pair-share, small groups, who reads) is phrased as
an option with its condition ("If your students enjoy…", "If you like…"), with
the practical tip Brian gave as the model example (ask ahead who is
comfortable reading aloud). Never "the right way", never "you should". Keep
the direct "what to push for" voice from the close-reading step as the
counter-example of what *is* allowed: directive about the text, optional about
the method.

### C3. Daily Pages timing note

**Fix.** In the class-starter/Daily-Pages section (L273–281): when Daily Pages
follows a reading, say in the step that it can be done in class or assigned
as homework, and leave the choice to the teacher.

### C4. Three exit tickets, one per focus

The three "vibes" Brian wants are exactly the existing focuses:
`understand-text`, `explain-concept`, `ask-question`
(`domain/assignment-types/exit-ticket.ts` L252–255).

**Fix.** Prompt: when a lesson ends with an exit ticket, offer three
`yawp-exit-ticket` blocks, one per focus, each with its own Add to stack /
Create button (already supported via `ticket`, `ticket:1`, `ticket:2`). Say
nothing about "give me a different one" in the UI; the chat below is for
alternatives (Brian's choice).

**Check first:** `ExitTicketCard` layout with three stacked cards; if it is
heavy, render three as a compact row (same component, `compact` prop).

### C5. Optional per-step tweak

Brian: "consider a small option on each step to shape it." **Recommendation:
defer.** The closing prompt (C6) covers it with less UI, and Brian's own
"limit the layers" note cuts against per-step controls. Revisit after A–B ship.

### C6. The line under the plan, and one closing question

**Fix.** Two pieces:

- *Deterministic, client-side:* under every plan-looking reply (where the
  pinned chips already render, `route.tsx` L1285–1300) add a `PlanFooter`
  line: "You don't have to use all of these. Add the pieces you want to the
  stack, or add the whole lesson." The chips stay exactly where they are
  (Brian likes them there). Copy is Kevin's call; this is the placeholder.
- *Prompt:* end every plan with exactly one question, "Want to refine or edit
  any part of this?", and nothing else. No menu of further rounds.

**Tests first.** E2E: the footer appears under `seedBareLessonPlan` and not
under an ask turn.

### C7. Accuracy guard

**Fix.** One prompt line under honesty rules (L430–439): names, quotes and
details must be exact; quote only what you are sure of, paraphrase otherwise
and say so. (Holden Langford.) Not testable beyond the wording assertion.

---

## D. Personality and the end of a session

### D1. Rewrite "Who you are" from the personality notes

Replace L245–252 with a section built from Brian's twelve points:

1. PhD-level pedagogy, current research, no fads.
2. Knows real rooms (phones, ADHD, the loud period and the quiet one); calm,
   wise, gracious, patient, kind, sometimes funny. Never talks down to the
   teacher or about students. Role: the department chair who gets it.
3. Teaches new teachers the *why*; affirms veterans.
4. Never requires, never persuades. Offers the best options; the teacher
   chooses.
5. Pushback ("that's stupid", "that would never work here") → peaceful,
   light humour, then back to the work: "Tell me about your class or your
   school. That might help us here."
6. Knows the texts and courses (canon to contemporary, AP Lang/Lit/History,
   science, math, special education) and fits materials to the audience.
7. Never invents facts, quotes or standards; says when unsure.
8. Personal questions about itself: "I'm really just an expert in pedagogy,
   methodology, and lesson planning, and that's where my identity ends." Then
   move on; do not hand the question back.
9. Badmouthing students → high road, kindly; personal struggles → "my
   expertise ends here", encourage talking to a real person; genuine pedagogy
   questions → full, instructive answers.
10. Joyful co-producer; planning a lesson is a bit like planning a show.
11. Celebrate when done; short warm send-off that may use a logistical detail
    the teacher mentioned ("go enjoy the game") and never probes.
12. Does not depend on chat memory (see D3).

Pass the teacher's first name (`teacherName`, currently `null` at `route.ts`
L350–361) so the send-off can use it.

**Tests first.** `build-system-prompt.test.ts` assertions for each numbered
behavior's key phrase. Add 6–8 eval conversations to the AI evaluation
workbench (`docs/work/2026-07-13-ai-evaluation-workbench-agent-prompt.md`)
covering pushback, a personal question, a therapist-style disclosure,
badmouthing students, and a done-for-the-day close.

### D2. A clear end

**Fix.** Prompt section "Beginning, middle, end": after the plan and the stack
invitation (C6), the planner moves toward a finished result; when the teacher
signals done (or the stack holds a deck/handout and they say thanks), it
celebrates and closes rather than offering more rounds. It keeps working if the
teacher keeps asking. Pair with a client cue: once the stack has ≥ 1 piece and
a deck or handout, the pinned chips become "Open the stack" and "I'm done for
today" (the latter sends a message that triggers the close).

**Open for Kevin:** where the warm-closing line sits versus engaging a
personal disclosure. **Rule for the prompt: the close may *echo* a plan the
teacher stated (a game, a weekend); it never *asks about* one, and it is one
sentence.**

### D3. Remember past work through the library, not chat memory

**Fix.** Two read-only tools in `lesson-planner-tools.server.ts`:
`search_my_lessons(query, {publishedOnly?})` over `LessonPlanConversation`
(`title`, `packetTitle`, first user message, material titles; this teacher
only; ordered by recency) and `read_my_lesson(conversationId)` returning the
packet via `loadLessonPacket`. Prompt: when the teacher refers to earlier
work, search the library first; if nothing matches, say so and ask for the
title or a detail; use conversation history only as a bonus. Additive, no
flag needed; tool allowlist test in `lesson-planner-tools.server.test.ts`.

Library discoverability (`routes/app.lesson-planner_.library/route.tsx`):
confirm search by title/topic/date exists; if not, a filter input is a small
follow-on.

---

## E. Slide decks: a YAWP! template, and editing

### E1. Deck design system

Brian: a real, designed template using the class-tile language; beautiful, not
decorative; no clip art, no site artwork; replace the small footer mark.

**Design brief (for Kevin to approve before code):**
- Palette from `app.css` tokens: cream `--background`, paper `--popover`,
  terracotta `--primary` (≈ `C05A3E`), ink `--foreground`, warm grey accent.
- Type: Cormorant Garamond (already loaded for display) for titles and
  quotes; the app's sans for body. Large type for questions.
- Tile language from `teacher-class-card.tsx`: card with soft ring and shadow,
  mono uppercase eyebrow (the step name and minutes), title, a colour block
  where the class art would sit (flat colour or a subtle generated texture,
  **never** the art files).
- A small typographic wordmark bottom-left + slide number bottom-right; no
  logo mark.
- Per-layout treatment (the eight `SLIDE_LAYOUTS` cover Brian's slide types):

| Brian's slide type | Layout | Treatment |
| --- | --- | --- |
| Title | `title` | Full-bleed colour tile, serif title, eyebrow with course · minutes |
| Class starter | `prompt` | Prompt as a large card on cream; timer eyebrow "8 min" |
| Framing question | `statement` | One line, very large serif, lots of space |
| Reading plan | `steps` | Numbered tiles in a row |
| Pair-talk prompt | `prompt` | Same card as starter, "Talk with a partner · 90 sec" eyebrow |
| Quote comparison | `compare` | Two tiles side by side, serif quotes |
| Daily Pages prompt | `prompt` | Card + "In class or at home" eyebrow |
| Exit ticket reminder | `closing` | Tile with the Yawp hand-off line |

**Code.** `lesson-pptx.server.ts`: define a master (`defineSlideMaster`) with
background, wordmark, slide number; rewrite the per-layout functions to the
tile treatments; load fonts by name (pptx cannot embed; pick fallbacks
`Georgia`/`Calibri`). `slide-canvas.tsx`: match the HTML presenter so Present,
PDF and PowerPoint agree. Behind `lesson_planner_deck_v2`; old renderer stays.

**Tests first.** Unit: `renderDeckPptx` output has one master, N slides, slide
numbers; snapshot a small deck's XML shape. Visual: a Playwright screenshot
test of the presenter for each layout (store under `e2e/__screenshots__`).

### E2. Deck card actions and a deck editor

Brian: "Save to PowerPoint", "Edit", "Present" on the card; delete slides
easily; a save replaces the planner's deck.

**Fix.**
- Card buttons: "Save to PowerPoint" (rename), "Edit", "Present". Keep the
  stack toggle as a small secondary control (Brian likes it elsewhere; see
  Inconsistencies).
- Editor route `app.lesson-planner_.$conversationId.deck.$messageId.edit`:
  slide list (reorder, delete, duplicate), per-slide text fields per layout,
  live `SlideCanvas` preview. Save validates with `deckSchema` and writes the
  deck as the filed material in slot `deck` (`edit-material` path, sets
  `editedAt`). The chat card and presenter read the filed material first,
  falling back to the message (`loadLessonDeck` already accepts either id), so
  the edited version **replaces** what the chat shows. Model revisions hit the
  existing 409 `confirmReplace` guard, so a hand edit is never silently lost.
- "Delete slide" is one click with Undo; no confirm.

**Tests first.** E2E: open editor from a seeded deck, delete slide 3, save,
return to chat → card says "11 slides" and Present skips it. Unit:
`deckSchema` round-trip on save.

---

## Sequencing

| Phase | Changes | Why first |
| --- | --- | --- |
| 1. Prompt + small UI (days) | C2, C3, C4, C6, C7, D1, D2, B3, B4 | Mostly `build-system-prompt.ts` and copy; biggest change in feel for least code |
| 2. The stack (1–2 weeks) | B1, B2, B5, B6, D3 | Makes "the stack is the lesson" true end to end |
| 3. Intake v2 (1–2 weeks) | A1–A4 | New controls + a column; needs the flag and the e2e rewrite |
| 4. Decks (2 weeks) | E1 design approval → E1 code → E2 | Design brief needs sign-off before code |
| Deferred | C5 | Brian's "limit the layers" argues against it for now |

## Decisions Kevin should make before execution

1. **B4:** drop "Add all as a handout" from the chat and limit "Add the whole
   lesson" to plan replies? (Recommended yes.)
2. **A2:** unset slider + remembered per-class length? (Recommended yes; adds
   `Class.periodMinutes`.)
3. **B6:** building from the stack replaces the existing deck slot? (Recommended
   yes.)
4. **C6:** wording and placement of "You don't have to use all of these."
5. **D2:** the one-sentence echo rule for the send-off.
6. **E1:** approve the design brief and the layout table.
7. **E2:** keep the stack toggle on the deck card alongside the three named
   buttons? (Recommended yes, as a secondary control.)

## Inconsistencies to check with Brian

- The deck card read **"60 min · English 11"** for a 90-minute plan. Duration
  is the sum of model-written slide minutes; B6 fixes it for stack-built
  decks, and a prompt line can tell the model to match the lesson length for
  chat-built ones.
- The **"Phantom YAWP" footer** is not rendered by any code path. Either the
  model wrote it into a closing slide, or the deck Brian reviewed came from the
  Lounge. Ask which file (`reference/slide-deck-day-1-example.pptx` is named
  in the notes but is not in this repo).
- The deck-card notes list three buttons without the "In the stack" toggle
  Brian praises in screenshot 17. Assumed: keep both.
- The day-one file is titled "screenshots 08 to 12" but covers 08 to 17.
