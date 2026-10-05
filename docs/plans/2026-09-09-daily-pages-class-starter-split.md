# Splitting Daily Pages into Class Starter and Daily Pages

## Why

Daily Pages has been doing two jobs with one grading assistant.

One job is the write-to-start-class freewrite: an open-ended prompt, graded on
whether the student showed up to the page, never marked up. The other is a short
piece of real writing — quick, but graded formally, the way an essay is graded
at a fraction of the length.

A single rubric cannot serve both, and the reason is not only how strict it is.
The freewrite must never be marked for grammar; the short piece must be. Tuned
soft, it gives full credit to a graded assignment that was never proofread.
Tuned formal, it marks up a five-minute warm-up, which kills the warm-up.

So: two assignment types, two grading assistants. The names swap to match what
teachers already call them — Class Starter is what Daily Pages has always been,
and Daily Pages becomes the graded one.

## The two assistants

| | Class Starter | Daily Pages |
|---|---|---|
| What it is | Open-ended writing to begin class | Short academic paragraph practice, graded formally |
| Shape | Explore; the point may arrive at the end, or not at all | One deliberate move (analyze, argue, compare, define…); a findable point, held up; no single required form |
| Categories | Engagement | Depth of Thought (0.30), Development of Thought (0.25), Organization/Structure (0.12), Voice/Style (0.20), Grammar/Syntax/Mechanics (0.13) |
| Scale | 0–3 (Absent → All in) | 1–5 (Beginning → Exemplary), the essay scale, with a written band per score |
| Feedback | Overall only | Per category |
| **Grammar** | **Never marked** | **Graded and marked up** |
| Full credit for honest effort | Yes | No — effort alone lands mid-scale |

The two bold rows are the split. Everything else follows from them.

What Daily Pages looks for is depth of thought and the development of thought —
not that the student has a pulse. That is why the two thinking categories carry
55% of the weight between them: a clean, well-ordered entry with nothing in it
is not a good Daily Pages entry, and a test asserts thinking outweighs craft so
that stays true if the weights are ever retuned.

Voice/Style carries 20% rather than the 10% it started with, and that number is
a decision rather than a default. Refinement is part of what the top of this
scale means, so an unedited entry cannot pass Proficient there however good its
ideas are — and at 10% that ceiling cost four points, which is not a rule. The
first seeded exemplar is what exposed it: it scored 94% on prose that opened "I
want to say yes, because…". Under the current weights an entry scoring
5/5/5/3/5 lands at 92%, below a refined 5/5/4/5/4 at 95%.

How it is graded is the essay's way, shrunk. Its three craft categories are the
essay rubric's own keys (`organization_and_structure`, `voice_and_style`,
`grammar_and_mechanics`), so a teacher grading both reads the same dimensions
and a score means the same thing in either place. The two that differ are the
two a fifteen-minute piece cannot fairly be held to: a full thesis, and evidence
in the research sense.

Both live next to the code that grades with them:

- `services/web-app/app/domain/assignment-types/class-starter-rubric.ts`
- `services/web-app/app/domain/assignment-types/daily-pages-short-form-rubric.ts`

Both are also in the shared rubric library (`starter-rubrics.ts`) as
`class-starter-engagement` and `daily-pages-short-form`, built from the same
constants so a library copy cannot drift from the built-in default.

## What changes for existing data

Nothing, until the flag is turned on.

- **Class Starter is additive.** A new `AssignmentType.kind` (`class_starter`)
  with its own default rubric. No existing row has that kind, so no existing row
  is affected. Its scale and its four words are identical to what Daily Pages
  scores on today, so a teacher moving an assignment across keeps their numbers.
- **`daily_pages` changes, and there is no flag.** A `daily_pages` type that
  saved no rubric of its own moves from judging engagement alone to the
  short-form rubric: a 1–5 scale, five categories, grammar marked. This was
  gated behind `DAILY_PAGES_SPLIT_ENABLED` and the gate was removed
  deliberately — the flag made the two assignment types indistinguishable in
  every environment, including the preview, which defeated the point of
  building them. The cost is that this cannot be rolled back without reverting
  the commit, and that it does not support a per-school pilot.
- **A saved rubric always wins.** A type that configured its own rubric — which
  includes production's Daily Pages row, scored 0–30 in steps of ten — is
  untouched with the flag either way. The `daily-pages-engagement` library entry
  stays in the library for exactly that reason.

## The teacher's grammar toggle

Not every quick write wants correctness graded, and the same teacher may want
one Daily Pages entry marked up and the next graded on the thinking alone. So
`Assignment.grammarGradingEnabled` is a per-assignment toggle set at creation,
alongside the tutor and collaboration toggles.

- **Null** is no preference, and the rubric decides. That is every assignment
  written before the column existed, so none of them change.
- **Off** drops the rubric's grammar category for that assignment: it is not
  scored, the writing is not marked up, and the weighted composite renormalizes
  over the categories that remain — `computeWeightedBandPercentage` already
  divides by the weight actually present, so nothing is redistributed by hand.
- The toggle is offered only for assignment types whose rubric grades grammar,
  because it only ever turns grammar grading off. Switching it on cannot invent
  a grammar category for a rubric that has none, so offering it on a Class
  Starter would be a lie.
- It is frozen after creation, like the two toggles beside it: work already
  graded was scored against a rubric that included the category, and flipping
  it afterwards would silently restate those grades. Making it editable is a
  reasonable future change, but it needs a re-grade story first.

## How long students have to write

The grammar checker is one prompt shared by every assignment type, and it read
every submission as a revised essay: a deliberate fragment in a ten-minute
paragraph was marked an error, and "omit needless words" applied to work no one
had time to cut. The grading assistant had the same blind spot.

`Assignment.writingTimeMinutes` fixes both. The teacher sets it on the
assignment, and it reaches:

- **The grading assistant**, as a block just ahead of the essay: grade it as
  that many minutes of writing, not as a revised piece. Calibrating is not going
  easy — a thin claim is still thin, and errors that get in the reader's way
  still count.
- **The grammar checker**, which then stops marking deliberate fragments and
  informal-but-correct phrasing, and at thirty minutes or less returns errors
  only, no style notes. Its schema-repair retry, which used to demand eight to
  twelve issues, asks only for the real ones.

**Null changes nothing.** With no writing time, both prompts are byte-for-byte
what ran before (asserted in tests), which is every assignment written before
the column existed — production's Daily Pages included.

The creation form suggests a time by kind: 15 minutes for Daily Pages (what its
about section promises), 10 for Class Starter, blank for everything else. The
suggestion is only a starting value; nothing reads it at grading time, so an
existing assignment is never given a time behind the teacher's back. Unlike the
grammar toggle, it stays editable after creation — it changes how future grading
reads the work, not a grade already given.

## Telling teachers what it is

The rubric change is invisible until a teacher assigns something. The page they
assign from is `/app/assignment-types/:id`, and until now the only teacher copy
on it explained how to browse the prompt library — how to click, not what they
were handing out.

So the Daily Pages page opens with an about section
(`app.assignment-types.$id/about-daily-pages/`) that answers, in order: what an
entry is, what it is not, how it is graded, how to run it with a class, and how
to write a prompt of your own.

All of that end to end is a page and a half, which nobody reads twice, so only
the blurb is open. It is the part that answers "what is this" for a teacher
seeing the type for the first time; the sections under it are questions they
come back with later, and each waits behind its own heading. The accordion is
`type="multiple"` because those questions get compared rather than browsed —
the grading weights and the prompt recipe want to be open at once.

The library directions are the last of those sections rather than a second
card. Two stacked explainer boxes above a prompt grid read as one wall
whichever order they are in, and "how to browse the corpus" is the narrowest
question on the page, not the first one.

Two decisions inside it are load-bearing:

- **The weights are read off the rubric, not retyped.** `GRADING_SUMMARY` maps
  `DAILY_PAGES_SHORT_FORM_RUBRIC.categories`, and a test asserts the keys,
  labels, and percentages match. Copy that describes the assistant and then
  drifts from what the assistant does is worse than no copy: a teacher who is
  told grammar is 15% and finds it is 30% stops trusting the page.
- **"What it is not" names the alternative each time.** Not a warm-up (that is
  a Class Starter), not an essay, not a reading check, not a length contest,
  not a grammar exercise. The Class Starter line is the one teachers get wrong,
  and it is the distinction the whole split rests on.

The prompt-writing half is the part that does the most work over a year. Most
Daily Pages prompts a teacher uses will be their own, written the morning of,
so the section teaches the shape rather than only handing out finished prompts:
a position to take, an explicit ask for the backing, a named finish line — then
three before-and-after rewrites and the five signs a prompt will not grade well.
The ask for the backing is the one that matters most, because a prompt without
it leaves Development of Thought nothing to read and the entry stalls mid-scale
no matter how the student writes it.

## Seeing it in a preview

A preview seeded from the production fixtures cannot show the split, for the
reason the rollout section gives: the Daily Pages row saved its own 0-30
engagement rubric, and a saved rubric always wins. Deployed as-is, a preview
grades Daily Pages exactly as production does today, which is the one thing a
preview of this change must not do.

So the seed does two things, in nonproduction only:

- **Clears the seeded Daily Pages row's saved rubric**, falling the type back
  to the short-form default for its kind. Production's row is untouched; this
  runs in `seed-local-dev` and again in `sync-prod-fidelity-fixtures`, because
  the fixture sync restores the saved rubric on every deploy.
- **Seeds a graded class set.** Four entries on one prompt
  (`sf-cd-002`), written to span the scale: one that complicates its own claim,
  one that answers properly, one that circles, and one that restates the
  prompt. Three released, one graded and held back. Each carries per-category
  scores and comments, an overall comment, grammar marks whose excerpts are
  checked to exist in the entry, and a grading-run snapshot of the rubric they
  were scored on.

The entries live in
`services/web-app/app/domain/assignment-types/daily-pages-sample-entries.ts`
so their percentages can be asserted against `computeWeightedBandPercentage`
rather than typed in by hand.

What the set shows, which prose about the rubric does not: because this rubric
is band-scored, an entry scored Proficient in all five categories is 60% — a D.
That is the honest consequence of a 1-5 rubric read as a percentage, and it is
worth seeing on the four entries before deciding whether the scale wants a
curve.

## Rollout

1. Create the Class Starter assignment type (see above) and move the freewrite
   assignments onto it. Do this **before** merging: once this lands, any
   `daily_pages` assignment still being used as a freewrite is graded as a
   short formal piece, grammar included.
2. Watch scores on the first graded Daily Pages entries. The distribution
   should fall relative to the old engagement score, because effort no longer
   earns the top and grammar now counts. Watch the grammar category in
   particular — it is the first time Daily Pages work has been marked up, and
   it is the change students notice first.
3. There is no flag to turn off if this goes wrong. Rolling back means
   reverting, or saving an explicit rubric onto the affected assignment types —
   a type that configured its own rubric is untouched by the default, which is
   what leaves production's 0–30 engagement row alone.

## Shape and register

The rubric first shipped describing depth of thought without ever saying what
the response should look like, and saying nothing at all about person, sentence
form or register. Silence there is not neutral: the instructions open with
"grade it the way you would grade an essay", so every convention the model
associates with school essays carried over by default, entry by entry, decided
by the model rather than by us.

**A Daily Pages entry is paragraph practice, and not one fixed form.** It is
short, academic writing — generally a paragraph, sometimes up to a page, written
in the time the teacher sets (often ten or fifteen minutes). Each prompt asks
for one deliberate academic move: analyzing, arguing a position, comparing,
defining a term, interpreting, evaluating, synthesizing. That deliberateness is
what separates it from a Class Starter, which is lower-stakes and open-ended.
It is not an exploration: writing to find out what you think, with the point
arriving at the end, is what a Class Starter is for.

The first draft of this rubric required the claim in the first sentence. That
fits an argued position and misfits most of the other moves — an analysis may
open on the passage, a definition on the case that sets it up — so it was
dropped. The rubric now asks that a reader can find the point, that the point
is held up, and that the paragraph is shaped the way its kind of paragraph
should be. A calibration case (`dp-definition-opens-on-a-case`) pins that a
strong paragraph can open on something other than a claim.

This changed the rubric's top bands, which had rewarded the opposite. "Arrives
somewhere the piece did not begin" and "the thinking compounds" describe the
exploration shape; they are gone, and Depth of Thought now reads whether the
point is worth making and survives the objection a reader raises first. A test
asserts no top band asks for a journey, because that language is easy to
reintroduce by accident.

**First person is allowed and is never an error.** A student may write "I", and
nothing marks them down for it. First person doing work — the student's own
experience as the evidence, a judgment that is theirs to own — is named as
top-entry writing rather than merely tolerated.

**What the top of the scale asks for is an edited piece.** Voice/Style reads
whether the prose has been worked on: an entry still carrying hedges in front
of the point, narration of its own process ("what I thought was", "I'm pretty
sure that"), or filler scores no higher than Proficient there, however good its
ideas are. The assistant coaches the cut — handing the student their own
sentence with the hedge removed — rather than deducting for the phrase, because
scoring a phrase teaches students to write around the rubric instead of
thinking. The cost lands on the piece being unedited, not on any one word.

**Grammar is scored on the AP standard for timed writing.** Some grammar and
spelling errors are understandable in a piece written this quickly; they lower
the score only when they are frequent enough to distract from meaning. Every
error is still marked up — the standard governs the score, not the
highlighting.

**The Tutor coaches the same things**, because the tutor is the half of
this a student meets before any grade exists:
`DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS` asks for the point, then the
support, then offers the hedge as an edit — and tells it not to encourage
exploring or freewriting.

That last part is content rather than code, and it is worth being plain about
what ships:

- The tutor's instructions live on the **assignment module row**, and the row
  in production is still the freewrite tutor — "help them think through an idea
  by asking them probing questions". Its `rubricAlignmentJson` is also unset,
  so none of the rubric's own language reaches the tutor either.
- The seed sets both for seeded environments, so a preview shows the real
  behaviour. Doing the same for a customer is a deliberate content change, like
  the rubric reset beside it.
- The tutor's one step ("Today's Writing") carries instructions of its own,
  joined after the module's, and the shipped step was the freewrite tutor
  (brainstorming, journaling, big praise). Left alone, the tutor was told both
  to coach one deliberate move and to encourage exploring. The seed replaces
  it with `DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS` (how a feedback
  round runs, with the safety boundaries kept word for word) and replaces the
  welcome, which told students they "may not need or want feedback", with
  `DAILY_PAGES_SHORT_FORM_WELCOME`. Stored copies of the old welcome in seeded
  documents are rewritten too. Seeded environments only, like the rest.
- The tutor's rubric guidance reads the rubric the type is graded on: its
  saved rubric, or the built-in one for its kind. It used to read only the
  saved rubric, so the seeded type, which clears its saved rubric on purpose,
  sent the tutor no rubric guidance at all.

## Calibrating strictness

The first graded examples read as too lenient. Strictness is tuned against
`app/domain/ai-evaluation/daily-pages-calibration.v1.ts`: eleven synthetic,
fifteen-minute paragraphs across the scale, each with educator bands for every
category. The bands encode the decisions above (effort alone below a passing
composite; strong paragraphs of more than one kind at the top; AP grammar;
unedited prose at or below Proficient on Voice/Style), and tests pin each.

    bun services/web-app/scripts/run-daily-pages-calibration.ts

runs it live against the built-in Daily Pages assistant and lists every score
outside its band as lenient or strict. Run it after any rubric or instruction
change, and before a new paragraph type is switched on. The cases are drafts
until product and an educator approve them.

## What students are aiming for

Each switched-on paragraph type has a guide
(`app/domain/assignment-types/daily-pages-paragraph-guides.ts`): the three
parts in plain words, the part students skip most, a model with each part
marked, a typical miss with the one change that fixes it, and the questions
the tutor will ask. Teachers read every guide under "The kinds of paragraphs"
on the Daily Pages page; students open their assignment's guide from "What
you're aiming for" beside the prompt. One component renders both, so a teacher
and a student read the same words.

- The guide names the same three parts, in the same order, as the type's
  tutor coaching, and a test holds that.
- Its models answer prompts that are not in the library, since a student
  reads the guide while writing; each miss answers the same prompt as its
  model so the two can be compared.
- Switching a type on needs its guide too: a test fails if a switched-on
  type has none.

## Assessing the tutor

The calibration suite asks whether the grader puts a finished entry in the
right band. The tutor is the half a student meets first, so it has its own
suite: `app/domain/ai-evaluation/daily-pages-tutor-evaluation.v1.ts`, one case
per phase of a draft (no point yet, a quote with no analysis, a revision after
feedback, a finished paragraph, "just write it for me", a hedged opener, a
safety disclosure, and Argue's straddle and untested position).

    bun services/web-app/scripts/run-daily-pages-tutor-evaluation.ts --repeat 3

asks the tutor for each reply exactly as the route would (the request is built
by the same `buildTutorMessages` and `buildTutorSystemPrompt`), then checks it
by code (brief, one question, no gushing, never "avoid I", nothing behind the
scenes exposed) and by an LLM judge against the case's criteria, quoting the
reply as evidence. It prints every phase with the tutor's actual words. The
tutor runs warm, so `--repeat` reports a pass rate rather than one sample. Run
it after any change to the module, step or paragraph-type instructions.

## Per-assignment settings

Four settings on the assignment sheet change how an entry is written or graded,
and the about page names each:

- **Time students have to write** — the grader and the grammar checker read the
  entry as that many minutes of writing.
- **Grammar grading** — off drops the grammar category for that assignment.
- **Tutor enabled** — off makes it a **cold write**. The sheet tags it, the
  student's prompt panel says so, and the grader is told it is unassisted work
  and not to refer the student to a tutor.
- **Submit for grade** — off runs it as practice; nothing reaches the gradebook.

## Paragraph types

A teacher can name the moves a Daily Pages entry practices — the **Paragraph
types** checkboxes on the assignment sheet, stored as
`Assignment.paragraphModes`. The registry is
`app/domain/assignment-types/daily-pages-paragraph-modes.ts`.

- **Several types, one paragraph.** A prompt can ask for more than one move
  ("take a position, and ground it in her words" is Argue and Analyze), so
  each switched-on type is a checkbox. With several ticked, the grader and
  tutor get every type's layer, in registry order, under one line saying the
  paragraph combines them: the grader reads for each, and the tutor coaches
  whichever the draft needs most first, never asking for two paragraphs. One
  type ticked gives exactly the single-type text.
- **Prefilled from the library.** Picking a library prompt ticks its
  switched-on Cognitive mode tags; the teacher can untick them.
- **Dual-write.** `paragraphModes String[]` (migration
  `20261005120000_paragraph_modes_list`) is written beside the old
  single `paragraphMode`, which keeps the first ticked type. Readers use
  `effectiveParagraphModes`: the list when it has entries, otherwise the old
  column, so assignments made before the list read the same. The old column
  can go once nothing reads it.
- **Students see each guide.** "What you're aiming for" opens every chosen
  type's guide, each under its own heading.

- **Layers, not new assistants.** A type adds guidance beside the writing time
  in the grading prompt, and coaching after the module's own tutor
  instructions. The rubric is unchanged, so a new type is a text constant and
  tests — not a new grading assistant built by hand.
- **One type at a time.** Each type has an `enabled` switch; teachers see only
  the enabled ones and the server refuses the rest. **Analyze** shipped first,
  built on Claim-Evidence-Analysis (offered as a guide, not the only form).
  **Argue a position** is second, built on Position-Reason-Test: a position a
  reader could disagree with, its strongest reason, and a specific case that
  tests it. Before switching the next one on: write its grading and tutor
  text, add calibration cases for it, run the calibration script, then flip
  `enabled`.
- **No type is the default** (all unticked: any kind of paragraph), stored as
  an empty list and null, which grades and tutors exactly as before. Frozen after creation, like the grammar
  toggle.
- **Argue a position** reads the position in Depth of Thought and the reason
  and its test in Development of Thought. A straddle ("both sides have a
  point") does not rise above Developing on Depth; a position held up only by
  generalities, never tested against a specific case, does not rise above
  Developing on Development. One reason developed beats three listed, and a
  formal counterargument and rebuttal is not required in a timed paragraph —
  facing the one case that tests the position is the move. A position that
  comes out of its test narrower is credited, not marked as a retreat.
- **The prompt library rolls out with the types.** Its Cognitive mode tags
  are the same moves, so the library shows only switched-on types: a library
  prompt keeps only its switched-on tags and is hidden when none are left
  (22 of the 31 prompts show with Analyze and Argue on). Saved prompts are
  never hidden. Switching a type on brings its prompts back with it.
- **A teacher can test one type end to end.** On Daily Pages, New → Document
  asks which type the document practices (any kind of paragraph, or each
  switched-on type). The choice is stored on `Document.paragraphMode` and
  `Document.paragraphModes`, which
  the tutor and the grader read when the document has no assignment; an
  assignment's own type always wins. A typed document is titled after its
  type so test documents are easy to tell apart. Null changes nothing.
- Calibration cases can name a `paragraphMode`, and the live runner grades
  them with that type's guidance in the prompt. The three Argue cases
  (`dp-argue-*`) do; the Analyze-tagged cases predate this and are still
  graded with no type chosen. The tutor evaluation has one combined case
  (`combined-argue-from-text`, Analyze and Argue together).
- The universal tutor persona is still copied into each module row's
  `tutorInstructions`; there is no shared tutor prompt in code. The type layer
  sits on top of whatever the module carries.

## Connected tools

Changing an assignment type changes what the tools built on it assume.

**Class Summary** now receives the conditions the class wrote under (type,
paragraph type, writing time, cold write, grammar graded) and applies the
grammar toggle to the rubric it summarizes.

**Lesson Planner** ([#374](https://github.com/The-Connell-School/yawp/pull/374))
is not on this branch. When it lands it needs:

- `search_short_form_prompts` and its tool description: "a graded Daily Pages
  reflection" → academic paragraph practice; filter by `cognitiveMoves` so a
  lesson asking for analysis gets Analyze prompts.
- `dailyPagesCreateHref`: pass the paragraph type (`analyze`) alongside
  `newPrompt` so the sheet opens with it chosen.
- The `sf-ex-*` ids no longer exist; the `/^sf-/` mapping to Daily Pages still
  holds for every remaining id.

**Re-test when an assignment type changes** (rubric, instructions, paragraph
types, or per-assignment settings):

1. `bun services/web-app/scripts/run-daily-pages-calibration.ts` — no new
   lenient or strict drift.
2. Grade one seeded Daily Pages entry end to end; check the marked-up grammar
   and per-category feedback.
3. Generate a Class Summary for a cold-write assignment; the next steps should
   not send students to the tutor or ask for revision.
4. Plan a lesson with a Daily Pages block in the Lesson Planner; the prompt and
   type should carry into the sheet.
5. Read teacher feedback since the last change for anything the tools now
   assume that teachers no longer do.

## Still open

- ~~**Whose sentence rules apply.**~~ Resolved by the writing time above: the
  shared checker is told how long the student had rather than which type it is
  grading, so a deliberate fragment in a timed piece is left alone.
- **Does personal experience count as evidence?** The seeded exemplar backs its
  claim with a story about a grandmother's painting and scores 94%, which looks
  right for a prompt with no assigned text. What happens when a prompt *does*
  name a text and the student reaches for an anecdote instead is unsettled.
- **Brief versus underdeveloped.** The instructions say never to mark an entry
  down for being brief; the Development bands mark an entry that does not hold
  its claim up. A three-sentence entry against a half-page target is both.
- ~~**`exit-synthesis` may now belong to Class Starter.**~~ Resolved: the kind
  is removed from the Daily Pages corpus. It asks the student to explore, which
  is a Class Starter's job.
- **Whether Organization should weigh more than 15%.** Shape is now a named
  requirement, and a response that buries its point loses ground in two
  categories rather than one. That may be enough; if it is not, the weight is
  the lever.

## Not in this change

- A prompt library of its own for the new Daily Pages. Both types currently
  share the open-ended library and generator, whose corpus is freewrite
  material — "pick something in this room nobody else has noticed" is a Class
  Starter prompt, not a graded one. A corpus of short graded prompts is its own
  piece of work, and worth deciding on before the flag goes on.
- Auto-migrating existing Daily Pages assignment types to Class Starter. Which
  of a teacher's Daily Pages are freewrites and which are reflections is a
  judgment call, so it stays a teacher's call.
