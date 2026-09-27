# Exit Ticket builder revisions (proposed changes for the Lesson Planner PR)

Target: The-Connell-School/yawp#374 ("The YAWP! Lesson Planner", branch
`claude/brave-brown-7unauw`), which carries the Exit Ticket assignment type and
its Lesson Planner hand-off.

Source: team discussion notes on Exit Tickets (2026-09). Every point in those
notes maps to a numbered change below.

## Where the PR is today

| Area | Current behavior | Code |
| --- | --- | --- |
| Shapes | `basic` (fixed prompt) or `specific` (focus + topic) | `domain/assignment-types/exit-ticket.ts` — `EXIT_TICKET_MODES` |
| Right answer? | Asked only for `specific`, as `objective` / `subjective`, no default | `EXIT_TICKET_ANSWER_TYPE_OPTIONS` |
| Basic prompt | "Tell me, in your own words, what you learned today…" + elaboration note | `BASIC_EXIT_TICKET_PROMPT`, `EXIT_TICKET_ELABORATION_NOTE` |
| Grading | Feedback-only by default; "For points" radio, 10 pts default. **Choosing points asks for nothing else**, so a basic ticket can be graded with no criteria | `EXIT_TICKET_SUBMIT_FOR_GRADE_DEFAULT`, sheet ~L1332 |
| Criteria | Three optional "lesson notes" (main points, must mention, mix-ups); open by default only for `specific` | `EXIT_TICKET_LESSON_NOTE_FIELDS` |
| Grading scheme | Rubric is one category with four bands, but the generic grading panel still offers **bands or steps** | `exit-ticket-rubric.ts`, sheet grading summary (`gradingMode`) |
| Tutor / groups | Tutor off by default; collaboration (one response per group) uses the shared controls | `EXIT_TICKET_TUTOR_ENABLED_DEFAULT`, collaboration block |
| Planner | Emits a ```` ```yawp-exit-ticket ```` block → "Create" button opens the sheet prefilled via URL params | `domain/lesson-planner/exit-ticket-block.ts` |
| After submission | Each response AI-read and scored; no ticket-specific class synthesis | `assignment-insights/*` (generic) |

The sheet also carries a lot of explanatory copy (mode descriptions, answer-type
helper text, lesson-note helper text, targeting hint, grading descriptions,
tutor note), all visible at once.

## Proposed changes

### 1. Make "reflection vs. check for understanding" the first choice

Notes: *distinguish subjective, open-ended reflection tickets from objective
end-of-class checks for understanding.*

Replace the `basic` / `specific` radio with:

- **Reflection** (subjective, default) — how did today land for you?
- **Check for understanding** (objective-leaning) — can you show you got one
  specific thing?

Mapping to today's model, so nothing stored changes meaning:

| New | Stored as (dual-write) |
| --- | --- |
| Reflection, default prompt | `mode: 'basic'` (unchanged) |
| Reflection, other suggested or custom prompt | `mode: 'basic'` + new `reflectionPrompt` |
| Check for understanding | `mode: 'specific'` (focus, topic, answerType unchanged) |

Add `kind: 'reflection' | 'check'` to the config JSON alongside `mode`.
Readers derive `kind` from `mode` when it is absent (all existing rows).

### 2. Suggested reflection prompts, plus "write your own"

Notes: *a small set of suggested prompts … along with a box for teachers to write
their own.*

`EXIT_TICKET_REFLECTION_PROMPTS` (new constant in `exit-ticket.ts`):

1. **What I learned** (default) — the current `BASIC_EXIT_TICKET_PROMPT`,
   verbatim, so existing and new default tickets read identically.
2. **Most interesting** — "What was the most interesting thing from today, and
   why did it stick with you?"
3. **Still wondering** — "What question do you still have about today's lesson?
   Say what you already understand that led you to it."
4. **Write your own** — free text, max ~300 chars.

`EXIT_TICKET_ELABORATION_NOTE` ("go beyond your first sentence… don't worry about
polish") is still appended to every prompt, including custom ones.

Store `reflectionPrompt: { id: 'learned' | 'interesting' | 'wondering' } |
{ id: 'custom', text }`. Absent = `learned`. The "Still wondering" prompt reuses
the `ask-question` grading criteria so a student is never marked down for not
knowing something.

### 3. Grading is optional for both kinds, and choosing it collects what's needed

Notes: *both subjective and objective tickets should have optional grading … ask
how many points it is worth and collect the criteria needed to grade it*;
*a general prompt does not give enough information for meaningful points-based
grading.*

Keep **ungraded (feedback and understanding only)** as the default for both
kinds. Replace the "For points" radio with a single **Grade this ticket**
switch. Turning it on reveals, in order:

1. **Points** — number field, default `EXIT_TICKET_DEFAULT_POINT_VALUE` (10).
2. **Criteria**, which depend on the kind:

**Reflection, graded** — "What earns the points?"

- *Completion* (recommended): any good-faith, on-topic response gets full
  credit; blank or "idk" gets zero. This is the quick-feedback case the notes
  expect to be common.
- *Quality of reflection*: judged on the existing four bands. Requires at least
  one of: main points of the lesson, or a length expectation (below).
- *Length expectation* (optional for either): minimum sentences **or** minimum
  words. Notes: *if points are assigned without a single correct answer, the
  teacher should specify what to assess, such as sentence length or word count.*

**Check for understanding, graded**

- "Is there a correct answer?" (existing objective/subjective question, now
  asked here).
  - **Yes** → required **Correct answer / key points** field (relabel and reuse
    `lessonNotes.mustMention`), optional **Common mix-ups** (`watchFor`).
  - **No** → required **What to assess** field (e.g. "uses a quote from the
    text", "names a claim, not a topic") plus the optional length expectation.

Validation (`parseExitTicketConfigInput`): when graded, reject a config that has
no criteria for its branch, with a field-level message ("Add the correct answer
so this can be graded" etc.). Ungraded tickets keep today's rules.

New config fields (all optional, additive):

```ts
grading?: {
  basis: 'completion' | 'bands';
  minSentences?: number;
  minWords?: number;
  assessFor?: string; // "what to assess" when there is no single right answer
};
```

`buildExitTicketGradingContext` gains:
- a completion paragraph (score 100 for any good-faith attempt, 0 only for the
  No-evidence band; feedback still written),
- the length expectation as a *threshold*, not a stepped penalty,
- `assessFor` text as the target when there is no right answer.

`submitForGrade` / `pointValue` keep being written exactly as today, so the
gradebook path is untouched.

### 4. Bands only, no stepped scale, for exit tickets

Notes: *grading bands are expected rather than a stepped grading scheme.*

For exit ticket types, force `gradingMode = 'bands'` and hide the bands/steps
choice in the grading panel (summary reads "Graded out of 10 points in bands").
Server side, `api.assignments.create` ignores a posted `steps` for this kind.
Existing exit ticket assignments are already band-scored by the rubric, so
nothing restates.

### 5. Fast default, progressive disclosure

Notes: *too involved for a task teachers expect to create quickly … make a
simple, ungraded subjective ticket the default and reveal more setup only when a
teacher chooses a graded or more specific ticket … collapsible explanations and
an optional step-by-step guide were viewed favorably.*

Default sheet for an exit ticket, top to bottom:

1. Title, post date, due date, attached materials (unchanged).
2. **Reflection** selected, "What I learned" prompt selected, live preview of
   what students see.
3. **Grade this ticket**: off.
4. **More options** (collapsed): tutor (off), group submission, lesson notes
   for feedback, grading strictness.
5. **Create**.

A default ticket is therefore title + Create.

Copy changes:
- Every paragraph of helper text longer than one line moves behind an
  "ⓘ Why?" disclosure (`<details>` or the existing Collapsible). That covers
  the objective/subjective explanations, the targeting hint, the
  feedback-only rationale, and the tutor-off rationale.
- Visible helper text is capped at one short sentence per control.
- **Optional guided mode**: a "Walk me through it" link at the top switches the
  exit ticket block to a 3-step stepper (Kind → Prompt → Grading) using the same
  state. It's a presentation wrapper only, so there's no second code path to
  validate.

### 6. Lesson Planner hand-off follows the same model

Notes: *the Lesson Planner can connect an exit ticket with other materials … the
flows are promising but may still have gaps.*

- **Block fields**: `exit-ticket-block.ts` accepts `kind`, `prompt`
  (`learned|interesting|wondering|custom`), `promptText`, `graded`, `points`,
  `basis`, `minWords`, `minSentences`, `assessFor`. Existing fields and aliases
  stay, so older conversations still parse. `exitTicketCreateHref` /
  `readExitTicketPrefill` carry the new params.
- **System prompt** (`build-system-prompt.ts`): default to an ungraded
  reflection. Propose a graded check only when the lesson has a concrete
  objective, and then always fill the correct-answer or what-to-assess field
  from the lesson's objective and misconceptions. A block the builder would
  reject is not emitted.
- **Gap audit**, one e2e path each in `teacher.lesson-planner.spec.ts`:
  - plan → deck + handout + ticket → Create ticket → the sheet opens prefilled
    **and** the deck/handout are listed as attached materials;
  - the ticket's closing slide in the deck and the printed ticket in the packet
    (`inlinePlannedExitTickets`) show the same prompt as the assignment;
  - editing the ticket in the sheet doesn't orphan the lesson link
    (`FROM_LESSON_PARAM`);
  - a malformed or partial block produces no button rather than a broken
    sheet (already covered in `exit-ticket-block.test.ts`; extend it to the new
    fields).

### 7. Exit tickets aren't disposable: synthesis view

Notes: *AI grading and synthesis could let teachers gather and review substantial
information about student understanding without manually grading every
response.*

On the exit ticket assignment page, add a **Class read** panel built on
`assignment-insights` (class-insight generation):

- band distribution (Explains it / Partly there / Names it only / No evidence),
  shown for ungraded tickets too, since every response is already scored;
- common misconceptions, checked against `watchFor` when present;
- a de-duplicated list of **open questions** students raised (from "Still
  wondering" / "what remains unclear");
- the 2–3 students who most need follow-up;
- a **Plan tomorrow from this** action that seeds a Lesson Planner conversation
  with the synthesis. This closes the loop between #6 and #7.

Group submissions count once per group, and the panel shows the group roster.

### 8. Unchanged (confirming the notes)

- Assignment details: title, posting date, due date, attached materials.
- Tutor toggle remains, default off.
- Collaborative use (one response per group) remains, moved under More options.
- Basic prompt wording and the "go beyond your first sentence, don't worry about
  polish" note are kept verbatim.
- Ungraded tickets are still read and given feedback by the AI.

## Backward compatibility and rollout (per AGENTS.md)

- Everything above ships behind a new flag,
  `EXIT_TICKET_BUILDER_V2_ENABLED`, next to `EXIT_TICKETS_ENABLED`. With the
  flag off, the current sheet renders unchanged.
- Config stays `schemaVersion: 1`, and every new field is optional. The v2
  sheet **dual-writes** `mode` plus the new fields, so the v1 sheet and
  `parseStoredExitTicketConfig` still read v2 rows. A custom reflection prompt
  also writes the composed text to `Assignment.prompt`, as today.
- No migration: `exitTicketConfigJson` is already JSONB.
- `EXIT_TICKET_SUBMIT_FOR_GRADE_DEFAULT = false` and
  `EXIT_TICKET_DEFAULT_POINT_VALUE = 10` are unchanged.

## Test plan (TDD order)

1. **E2E first** (`e2e/tests/teacher.exit-ticket.spec.ts`):
   - default ticket is created with only a title and is ungraded;
   - Grade on + Reflection + Completion → 10 points, bands, correct grading
     context;
   - Grade on + Check + correct answer required (Create disabled until filled);
   - custom reflection prompt shows up in the student view;
   - "Why?" disclosures are collapsed by default; the stepper creates the same
     ticket.
2. **Unit tests**: `exit-ticket.test.ts` (parse/compose for new fields,
   legacy rows read as before), `exit-ticket-rubric.test.ts` (completion and
   length paragraphs, `assessFor`), `exit-ticket-block.test.ts` (new block
   fields, prefill round-trip), `api.assignments.create/route.test.ts`
   (bands forced, graded-without-criteria rejected).

## Open questions for the team

1. Should a graded **Reflection** default to *Completion*, or should the teacher
   have to pick?
2. Length expectation: sentences, words, or both? Should the student see a live
   counter?
3. Should the "Write your own" prompt still get the elaboration note appended,
   or should the teacher control it?
4. Should the synthesis panel (#7) ship in this PR or a follow-up? It's the
   largest item and is separable.
5. Should suggested reflection prompts be org-editable, like
   short-form-prompts-library, or a fixed set to start?
