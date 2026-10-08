# Product behavior change — Composition and Writing Practice gating tests

Work: `yawp-unit-suite-green-20261008`

## Intended workflow change

None in this diff. The product change shipped in #389 (`c99b8fde`, "Enable
Reporter and Writing Practice for all orgs (remove gating)"), which removed the
`isCompositionPracticeEnabled()` check from `app.writing-lessons.assign` and the
`organization.writingPracticeEnabled` / Composition checks from the `app._index`
loader. Those routes now carry the comment "Composition is always enabled for
all orgs." The unit tests asserting the old gates were never updated because CI
did not run the full web-app suite, so they have failed on main since #389.

Workflow now proven: a teacher can assign a Composition writing lesson, and a
student's dashboard shows assigned Writing Practice (including Composition)
regardless of the retired `COMPOSITION_PRACTICE_ENABLED` env flag or the
retired per-organization `writingPracticeEnabled` column.

## Assertions that were rewritten and why

| Old assertion | Replaced by |
| --- | --- |
| `app.writing-lessons.assign`: Composition lesson rejected with "Composition practice is not enabled" when the flag is off | Composition lesson is assigned with the flag off |
| `app._index`: Composition assignments hidden when the flag is off | Composition assignments listed with the flag off |
| `app._index`: assigned practice not loaded when `writingPracticeEnabled` is false | Assigned practice loaded for the student when the column is false |

If Composition is meant to stay hidden in production, that is a regression in
#389's route code, not in these tests, and needs its own work item.
