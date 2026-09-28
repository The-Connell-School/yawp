# Cold and Warm Writes

**Date:** 2026-09-13

## The distinction

Every assignment carries `Assignment.tutorEnabled`, a teacher-set toggle chosen at
creation and frozen afterwards (students may already be mid-draft with the tutor
either way). That toggle defines the condition a paper was written under:

| Term | `tutorEnabled` | What it shows |
|---|---|---|
| **Cold write** | `false` | What the student can do without AI support. The diagnostic. |
| **Warm write** | `true` | What the student produces with support available. The everyday work. |

Some teachers say "hot write" for a warm write; it means the same thing.

## Why the reporter keeps them apart

There is ample evidence that an AI tutor lifts writing *while the tutor is on*.
The open question for Yawp is the harder one: does the tutor make writing better
**when it is not there**? That is a question about transfer, and only cold writes
can answer it.

So rising warm scores are the expected result, not the interesting one. A rising
**cold** trajectory — and a warm-minus-cold gap that narrows as it rises — is the
evidence that a skill was internalized rather than merely scaffolded. Averaging a
diagnostic paper together with tutor-supported ones destroys exactly the signal
the comparison exists to find, so the reporter never does.

## The practice this supports

Teachers who are already doing this run a cold write early (a baseline), warm
writes through the term, and another cold write at the midterm or year end. The
cold writes punctuate the year; the pair of them brackets the growth.

## What is implemented

The reporter reads the assignment's tutor setting alongside every graded
submission and reports the two conditions separately:

- `writeModes` on the class report, student grade report, and growth report —
  each condition's average, its own first→latest arc and trend, and its own
  rubric profile, plus `supportGapPercentage` (warm average − cold average).
- `writeMode` on every submission row, every growth point, and on
  `get_submission_detail`, so a quoted sentence is read against the right
  expectation.
- Per-student `coldAveragePercentage` / `warmAveragePercentage` on class reports.
- Guardrails the model must honor rather than talk past: `comparable` is false
  when one condition has no graded work, `caveat` names a thin sample in plain
  language (one cold write is a baseline, not a trend), and `unclassifiedCount`
  covers papers whose assignment recorded no tutor setting.

Nothing about grading, tutor behavior, or the assignment flow changed. Papers
without a recorded tutor setting stay unclassified rather than being folded into
either condition.

## What is deliberately not built yet

- **No course or module** that walks a teacher through the diagnostic cadence.
  Today a teacher does this by hand, by turning the tutor off; the reporter just
  notices when they have.
- **No cold/warm marker in the teacher UI** outside the assignment editor, so the
  vocabulary currently lives in the reporter's answers rather than on assignment
  cards.
- **No cohort or longitudinal analytics** across classes or school years.
