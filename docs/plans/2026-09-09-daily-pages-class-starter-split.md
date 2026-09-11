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
| What it is | Open-ended writing to begin class | A short piece of writing, graded formally |
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
- **`daily_pages` is gated.** `DAILY_PAGES_SPLIT_ENABLED` (default off) decides
  which assistant a `daily_pages` type falls back to when it has saved no rubric
  of its own. Off is byte-for-byte today's behaviour.
- **A saved rubric always wins.** A type that configured its own rubric — which
  includes production's Daily Pages row, scored 0–30 in steps of ten — is
  untouched with the flag either way. The `daily-pages-engagement` library entry
  stays in the library for exactly that reason.

## Rollout

1. Ship with `DAILY_PAGES_SPLIT_ENABLED` unset. Class Starter becomes available;
   Daily Pages grades as it always has.
2. Create the Class Starter assignment type:
   `bun run --cwd packages/prisma seed-class-starter-assignment-type`.

   This is a script rather than a click because `AssignmentType.kind` is what
   selects a grading assistant, and the admin "New assignment type" form writes
   `kind: null` — a Class Starter created through the UI would silently grade on
   the thesis-driven essay rubric. `kind` is unique, so there is one row per
   database; the script is idempotent and re-running it un-archives the row.

   Letting the form set `kind` was the alternative. It stays closed for now:
   a mistyped kind is a silent grading change, and the set of kinds that mean
   anything is fixed in code, not open-ended.

   The script also attaches the Class Starter card artwork
   (`packages/prisma/scripts/assets/class-starter.jpg`), drawn to sit with the
   Daily Pages image: same 940x788 frame, torn paper edge, scratchy ink and
   Didone wordmark. That attach is create-only — an admin who uploads their own
   artwork keeps it, and replacing the seeded one means deleting the
   `AssignmentTypeImage` row and re-running.

   Preview environments run this seed themselves, so every PR preview has a
   Class Starter to click on. It is invoked from two places, and the reason is
   worth knowing before changing either:

   - `seed-local-dev` and `sync-prod-fidelity-fixtures` both call it. The
     preview deploy runs exactly one of the two — the first for a freshly
     created database, the second for one that already existed — so both need
     it. These run from the PR's own source.
   - `scripts/preview/deploy.sh` also calls it, which covers the
     `production-dump` and `sanitized-production` data modes where neither of
     those two scripts runs. Its files are also in the tooling fingerprint,
     without which a preview whose database already exists would skip tooling
     wholesale and never run the seed.

   The deploy.sh half only takes effect once merged. The preview workflow is
   `pull_request_target`, so it checks the control scripts out of the default
   branch — a PR's own edit to `deploy.sh` cannot affect that PR's preview.
   Only the application source under `$SOURCE_DIR` comes from the PR head,
   which is why the seed has to be reachable from a script the deploy already
   invokes out of that source.

   Then move the freewrite assignments onto the new type.
3. Turn the flag on in staging, then for a pilot org. Watch scores: the
   short-form rubric should pull the middle of the distribution down relative to
   the old engagement score, because effort no longer earns the top and grammar
   now counts. Watch the grammar category in particular — it is the first time
   Daily Pages work has been marked up, and it is the change students will
   notice first.
4. Leave both live for at least two weeks before considering the legacy Daily
   Pages default retired. Turning the flag off is a complete rollback — there is
   no data to migrate back.

## Not in this change

- A prompt library of its own for the new Daily Pages. Both types currently
  share the open-ended library and generator, whose corpus is freewrite
  material — "pick something in this room nobody else has noticed" is a Class
  Starter prompt, not a graded one. A corpus of short graded prompts is its own
  piece of work, and worth deciding on before the flag goes on.
- Auto-migrating existing Daily Pages assignment types to Class Starter. Which
  of a teacher's Daily Pages are freewrites and which are reflections is a
  judgment call, so it stays a teacher's call.
