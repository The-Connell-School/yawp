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
| What it is | Open-ended writing to begin class | A short, claim-first response, graded formally |
| Shape | Explore; the point may arrive at the end, or not at all | A body paragraph: claim first, then the case for it |
| Categories | Engagement | Depth of Thought (0.35), Development of Thought (0.25), Organization/Structure (0.15), Voice/Style (0.10), Grammar/Syntax/Mechanics (0.15) |
| Scale | 0–3 (Absent → All in) | 1–5 (Beginning → Exemplary), the essay scale, with a written band per score |
| Feedback | Overall only | Per category |
| **Grammar** | **Never marked** | **Graded and marked up** |
| Full credit for honest effort | Yes | No — effort alone lands mid-scale |

The two bold rows are the split. Everything else follows from them.

What Daily Pages looks for is depth of thought and the development of thought —
not that the student has a pulse. That is why the two thinking categories carry
60% of the weight between them: a clean, well-ordered entry with nothing in it
is not a good Daily Pages entry, and a test asserts thinking outweighs craft so
that stays true if the weights are ever retuned.

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

**A Daily Pages entry is claim-first.** It is written the way a strong body
paragraph is written — the claim in the first sentence, the support behind it,
a close that lands. It is not an exploration. Writing to find out what you
think, with the point arriving at the end, is what a Class Starter is for now,
and that division is the whole reason there are two assignment types. The
prompt may be anchored to a text or an excerpt, or be general; what does not
vary is the shape.

This changed the rubric's top bands, which had rewarded the opposite. "Arrives
somewhere the piece did not begin" and "the thinking compounds" describe the
exploration shape; they are gone, and Depth of Thought now reads whether the
claim is worth making and survives the objection a reader raises first. A test
asserts no top band asks for a journey, because that language is easy to
reintroduce by accident.

**First person is allowed and is never an error.** A student may write "I", and
nothing marks them down for it. What the assistant coaches — in Voice/Style
feedback, never in the score — is the hedge in front of the claim: "I think
that…", "In my opinion…". It hands the sentence back with the hedge cut so the
student can see the claim underneath. Scoring a phrase would teach students to
write around the rubric instead of thinking, which is the failure mode the
whole split exists to avoid.

**The Tutor coaches the same two things**, because the tutor is the half of
this a student meets before any grade exists:
`DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS` asks for the claim, then the
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

## Still open

- **Whose sentence rules apply.** Grammar/Mechanics grades "sentence
  construction … and formatting" at 15%, and the markup comes from one
  Grammar/Usage Checker prompt shared by every assignment type — it does not
  know this is a paragraph written in ten minutes. A deliberate fragment ("Not
  always. Only when it costs something.") is marked an error today. Relaxing
  that means teaching the shared checker which type it is grading, which is
  code rather than copy.
- **Does personal experience count as evidence?** The seeded exemplar backs its
  claim with a story about a grandmother's painting and scores 94%, which looks
  right for a prompt with no assigned text. What happens when a prompt *does*
  name a text and the student reaches for an anecdote instead is unsettled.
- **Brief versus underdeveloped.** The instructions say never to mark an entry
  down for being brief; the Development bands mark an entry that does not hold
  its claim up. A three-sentence entry against a half-page target is both.
- **`exit-synthesis` may now belong to Class Starter.** One of the six corpus
  kinds asks what changed today and what changed it — which is exploration by
  design, and reads oddly against a claim-first rubric. Worth deciding before
  the corpus grows.
- **Whether Organization should weigh more than 15%.** Shape is now a named
  requirement, and a response that buries its claim loses ground in two
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
