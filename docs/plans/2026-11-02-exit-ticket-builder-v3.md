# Exit Ticket builder v3: less reading, purposeful activities

Source: team review of the exit-ticket home page and creation flow (Brian,
Kevin, 2026-11), plus Brian's "Assignment-Type Homepages — Copy Edits for
Kevin" doc (Exit Ticket page and the "Exit Ticket: new wording rule" comment),
which is the source of truth for copy below.

Builds on `2026-09-27-exit-ticket-builder-revisions.md` (the quick builder
that ships today). Everything here sits behind a new flag,
`exit-ticket-builder-v3`. With the flag off, today's quick builder renders and
posts exactly as it does now.

## Decisions taken for the open questions

| Question | Decision | Why |
| --- | --- | --- |
| Does the teacher write the prompt? | **Yes.** A prompt box is back, required. Each activity gives a placeholder (checks) or a one-tap starter (reflection) instead of a composed fill-in-the-blank. | Notes: "basic flow retains title, post date, due date, and prompt"; "a teacher creating one independently can simply write it." |
| Is the closing line editable? | **No, appended by activity** and shown in the preview. | Brian's wording rule says which closer each kind gets ("put these rules in the generation rules, not in one lesson"). Teachers type only the question. |
| Single right answer? | **No yes/no question.** One optional "Correct answer or key points" field; the grader is told to credit the same answer in different words or spelling (Allie / "Alley"). | Notes lean away from a rigid answer key. |
| Can a check be graded for completion? | **Yes.** Completion or Understanding, for every activity. | Notes: teachers may award completion points to encourage submission. |
| Are criteria required to grade on Understanding? | **No.** The teacher's prompt plus optional key points is enough; the form says that key points make the read sharper. | Notes: "using the teacher's prompt or key points and AI-supported interpretation." |
| Class summary (item 6) in this round? | **Planned here, built last**, behind its own flag. The deterministic Class read already ships and stays. | It is the largest, separable piece and needs a model call. |

## 1. Strip the form to the basics

**Exit ticket + v3 flag on:**

- Remove the **Attachment** field (upload input and its helper text). When
  editing an exit ticket that already has an attachment, still show the
  attachment row with **Remove**, so nothing is stranded. The server is
  unchanged: it still accepts an attachment from any older client.
- Remove the **Walk me through it** stepper and every "Why?" disclosure in the
  builder. One short description per choice replaces them.
- Remove **minimum length** and **What should be assessed?** from the grading
  section. The server still accepts and stores both from older clients.
- The screen reads, top to bottom: class(es), Title, Post date / Due date,
  **What will students do?**, **Prompt**, **Correct answer or key points**
  (checks only), **What students will see** (preview), **Grade this ticket**,
  **More options** (lesson notes, tutor, groups).

**Lesson Planner path (item 2 in the notes):** no new UI. The planner already
emits a `yawp-exit-ticket` block that opens this sheet prefilled. v3 adds an
`activity` field to that block (section 2 below), and the v3 sheet converts
any legacy prefill (mode/focus/topic/reflection prompt) into an activity and
prompt text, so planner hand-offs work before and after the planner change.

Files: `components/assignments/assignment-creation-sheet.tsx` (attachment
block, builder switch), new `components/assignments/exit-ticket-builder-v3.tsx`.

## 2. Two groups, four student-centred activities

Stored as a new optional `activity` on the exit ticket config.

**Reflection / question** — *Students tell you what they learned, what
surprised them, or what they're still wondering.*

- `reflect` — **Have the students reflect or ask a question.** This merges
  today's Reflection kind with "Still wondering" and the old check option
  "Ask a question" (both were "students say what they wonder"). Three starter
  chips fill the prompt box: *What I learned*, *What surprised me*, *Still
  wondering*. The default is *What I learned*, so a title-only ticket still
  works in one click.

**Check for understanding** — *Name the idea you're checking and let students
show it. You can set the correct answer or key points.*

- `explain-concept` — **Have the students explain a concept.** "Ask them to
  explain, not recall: put the idea in their own words, so you see who
  understood it rather than who memorized a sentence."
- `answer-question` — **Have the students answer a question.** (Renamed from
  "Ask a question": the teacher supplies the question.) "Ask a quick question
  about what you just taught to see who got it. Add the answer below and a
  right answer in different words, or misspelled, still counts."
- `engage-text` — **Have the students engage with a text or source.** "Point
  them at a passage, poem, image or document from the lesson and have them
  work with it: find features in a poem, or answer a few questions about the
  text."

Each activity has an example placeholder in the prompt box (e.g. "Reread the
second stanza. Find two examples of enjambment and say what each does to the
poem's pace."). Descriptions are written to steer teachers toward one
purposeful ask ("Ask for one thing", "explain, not recall"), following the
"What makes a good exit ticket" section of Brian's doc.

**Storage (dual-write, `schemaVersion` stays 1, no migration):**

| Activity | `mode` / `kind` | Legacy fields written as well |
| --- | --- | --- |
| `reflect` | `basic` / `reflection` | `reflectionPrompt: { id: 'custom', text }` |
| `explain-concept` | `specific` / `check` | `focus: 'explain-concept'`, `topic` = prompt (≤200 chars), `answerType: 'subjective'` |
| `answer-question` | `specific` / `check` | `focus: 'explain-concept'`, same |
| `engage-text` | `specific` / `check` | `focus: 'understand-text'`, same |

New optional fields: `activity`, `promptText`, `starter` (reflect only).
Readers that predate v3 drop the new keys and still parse a valid config.
`Assignment.prompt` is written already composed, so students always see the
v3 wording.

Files: `domain/assignment-types/exit-ticket.ts` (types, options, parse,
compose), `utils/assignment-exit-ticket.server.ts` (read the new form fields).

## 3. Wording rule for prompts (Brian's comment)

New closers, chosen by activity. Legacy constants are kept untouched for rows
and clients that predate v3.

- **Explain in your own words** (`explain-concept`, and the *What I learned*
  starter) end with exactly: "Keep it conversational, in your words, and write
  as much as you can — the more you can explain your thinking, the better.
  Don't worry too much about polish. This is about what you understand, not
  writing perfectly."
- **Questions you still have** (*Still wondering*) and **quick checks**
  (`answer-question`): no length push. They get only "Don't worry about
  polish."
- `engage-text`, *What surprised me*, and a reflection the teacher rewrote:
  "Don't worry about polish."
- No v3 text uses "someone who missed class", "not the definition you were
  given", "ask the real one", or "the one you were afraid to ask".
- **Planner generation rules:** `build-system-prompt.ts` exit-ticket section
  gets the same rule and the `activity:` field (Phase 4).

## 4. No rigid answer key

- The v3 form never asks "Is there a correct answer?". `answerType` is written
  as `subjective` for older readers.
- The grading context for a v3 ticket gets a new section in place of the
  answer-type paragraph: judge understanding against the prompt and the
  teacher's key points; credit a correct idea in different wording, order, or
  spelling (a student who writes "Alley" for Allie has the right answer);
  only a response that contradicts the key points or misses them entirely is
  marked as not there yet.
- Per-activity grading criteria (`explain-concept`: own words; `answer-question`:
  does it answer the question, judged on meaning not phrasing;
  `engage-text`: anchored to the source; `reflect`: specific and honest, not
  knowing is never a failure when the prompt asks what they wonder).
- What exactly grading on "Understanding" means in points is unchanged: the
  four exit-ticket bands. Still open for the team: whether an Understanding
  grade on a `reflect` ticket needs main points (v3 says no).

Files: `domain/assignment-types/exit-ticket-rubric.ts`.

## 5. Grading optional, tutor off by default

- **Grade this ticket** checkbox, off by default (unchanged default). Helper:
  "Grading is optional. Set it for an easy grade or leave it ungraded if you
  just want to see who got it and who didn't."
- On: points (default 10) and **Graded on**: *Completion — full credit for any
  real attempt* (default) or *Understanding — scored on how well they show
  they understand it*. Bands, never steps, as today.
- **Tutor enabled** stays off by default for exit tickets. Its copy becomes
  Brian's: "It starts off, because an exit ticket shows what students
  understand on their own. Turn it on for a class that tends to hand in six
  words. It will ask them to say more without giving away the answer or
  writing for them."

## 6. Class-level summary (planned, built last)

Exists today: the deterministic **Class read** panel (band counts, open
questions, who to follow up with, *Plan tomorrow from this*). v3 extends it:

1. **Summary paragraph** (model call, flag `exit-ticket-class-summary`): what
   the class understood, where the confusion is, and a reteach recommendation
   (`none` / `quick review` / `reteach`). Generated once the read count crosses
   a threshold, cached on the class assignment, regenerated when new
   responses are read. Input: the prompt, key points, and response texts.
2. **Individual responses** stay one click away (existing submissions list);
   the panel links to it.
3. **Next-lesson suggestion** (later): *Plan tomorrow from this* passes the
   summary into the planner seed so it can propose, e.g., a 10-minute
   reteaching block.

Not started in this round; needs a cost estimate and a schema decision (cache
column versus table) before building.

## 7. Rollout and backward compatibility

- Flag `exit-ticket-builder-v3` in `domain/feature-flags/feature-flags.ts`:
  off by default; on by default on demo and PR previews, like the prompt
  generator.
- The sheet gets `exitTicketBuilderV3Enabled` (default `false`). Each of the
  five routes that render `AssignmentCreationSheet` reads the flag in its
  loader for the teacher's org and passes it on.
- The server detects a v3 post by the presence of `exitTicketActivity`, the
  same shape-based pattern as `exitTicketKind` for the quick builder. A v3
  config is a valid v1 config plus optional keys, so turning the flag off
  never breaks a ticket: the quick builder reopens it as the reflection or
  check it was dual-written as.
- No migration. Old rows, old clients, and the planner's existing block
  fields keep working.

## Build order (TDD, one commit per phase)

1. **Domain** — unit tests first in `exit-ticket-v3.test.ts`: options, parse
   (valid, missing prompt, too long, kind conflicts, grading without
   criteria), dual-write fields, compose closers per activity/starter, stored
   round-trip, legacy-to-v3 draft conversion. Rubric context tests in
   `exit-ticket-rubric.test.ts`. Then the code.
2. **Flag + server** — flag registration and default-on test; form-field
   parsing tests in `assignment-exit-ticket.server.test.ts`; then the code.
3. **Sheet** — e2e first, `e2e/tests/teacher.exit-ticket-v3.spec.ts` (flag
   on): no attachment field; four activities in two groups; default reflect
   ticket created with a title only; answer-question with key points; closers
   in the preview; graded completion check; tutor off with new copy; editing
   keeps activity and prompt. Then `exit-ticket-builder-v3.tsx`, sheet wiring,
   and loader plumbing in the five routes.
4. **Planner** — `activity:` in the `yawp-exit-ticket` block and create link
   (tests in `exit-ticket-block.test.ts`), and the wording rule in the planner
   system prompt under the flag.
5. **Class summary** — separate plan and flag (section 6).

## Status

- Phases 1–3 in progress on `claude/affectionate-noether-6g3y31`.
- E2E specs are written to this plan but could not be run in the build
  container (no Docker/Postgres); they need a CI or local run before review.
