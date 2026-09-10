# Splitting Daily Pages into Class Starter and Daily Pages

## Why

Daily Pages has been doing two jobs with one grading assistant.

One job is the write-to-start-class freewrite: an open-ended prompt, graded on
whether the student showed up to the page. The other is the thing teachers keep
reaching for next — a reflection on a text or topic the teacher assigned, which
is more specific and should ask more of the student than a freewrite does.

A single rubric cannot serve both. Tuned soft enough for the freewrite, it gives
full credit to a reflection that never touches the assigned text. Tuned for the
reflection, it punishes a student for writing loosely in a five-minute warm-up,
which is the whole point of the warm-up.

So: two assignment types, two grading assistants.

## The two assistants

| | Class Starter | Daily Pages |
|---|---|---|
| Prompt | Open-ended | Anchored to an assigned text or topic |
| Categories | Engagement | Engagement with the Text or Topic (0.35), Depth of Reflection (0.40), Clarity of Expression (0.25) |
| Scale | 0–3 (Absent → All in) | 0–4 (Absent → Went further), with a written band per score |
| Feedback | Overall only | Per category |
| Grammar | Never marked | Never marked |
| Full credit for honest effort | Yes | No — effort alone lands mid-scale |

The last row is the split. Everything else follows from it.

Both live next to the code that grades with them:

- `services/web-app/app/domain/assignment-types/class-starter-rubric.ts`
- `services/web-app/app/domain/assignment-types/daily-pages-reflection-rubric.ts`

Both are also in the shared rubric library (`starter-rubrics.ts`) as
`class-starter-engagement` and `daily-pages-reflection`, built from the same
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

   Preview environments run this seed themselves, after whichever data path
   created an organization and before the assignment-type release gate, so
   every PR preview has a Class Starter to click on. Its files are part of the
   tooling fingerprint — without that, a preview whose database already exists
   would skip tooling wholesale and never run the seed.

   Then move the freewrite assignments onto the new type.
3. Turn the flag on in staging, then for a pilot org. Watch scores: the
   reflection rubric should pull the middle of the distribution down relative to
   the old engagement score, because effort no longer earns the top.
4. Leave both live for at least two weeks before considering the legacy Daily
   Pages default retired. Turning the flag off is a complete rollback — there is
   no data to migrate back.

## Not in this change

- A prompt library of its own for the new Daily Pages. Both types currently share
  the open-ended library and generator; the reflection prompts want a text or
  topic attached, which is its own piece of work.
- Auto-migrating existing Daily Pages assignment types to Class Starter. Which
  of a teacher's Daily Pages are freewrites and which are reflections is a
  judgment call, so it stays a teacher's call.
