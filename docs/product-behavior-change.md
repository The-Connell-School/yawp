# Authorized behavior recovery: assignment rubric selection

Bryant explicitly requested on September 9, 2026: bring back the rubric selector and fix assignment-type creation. He rejected the inline-editor workflow accepted by PR357 and requested a postmortem. This declaration records that requirement; it does not infer authorization from passing tests.

## Intended behavior

- Create and edit show the shared library rubric selector. Creation can choose a rubric before the first save.
- Saving persists the rubric relationship and assignment-specific grading instructions. Reopening shows the saved selection. Grading, prompt previews, and evaluation runs resolve that same rubric.
- Title-only creation retains the built-in default option. Selecting a library rubric never requires manually entering inline categories.
- Validation stays in the form and preserves inputs. Cancel restores saved selection/instructions; clearing the selection restores the underlying assignment configuration/default.
- Basics-only saves preserve exact raw grading JSON, calibration, and grading version. Promoted prompt templates remain effective with library rubrics. AP History snapshot semantics remain unchanged.

## Why existing browser expectations change

PR353 removed the selector. PR357 commit939813f7 replaced selector/persistence assertions with inline-category editing and accepted an unwanted version increment. Those assertions described the regression, not an approved product change.

This recovery removes manual inline-category setup from creation tests and restores visible selector and persisted rubricId assertions. It restores exact legacy JSON equality and unchanged version7, rather than subset equality and version8. Existing create-page rendering, successful creation, and edit success cases remain covered; the diff relocates some lines when inserting a new first test.

Additional tests cover selecting during creation, validation preservation, save/reload, cancel, clear/reload, prompt tools, effective compiled grading configuration, selected-rubric evaluation inputs, and promoted templates. This is a workflow restoration with stronger preservation proof, not permission to weaken unrelated tests.

## Review and release gates

Two independent reviews checked requirements and persistence. The second caught prompt/evaluation paths that still read inline configuration; those are included in recovery. Release requires the Record assignment-rubric proof profile and required repository CI, followed by production/demo verification. The incident postmortem is docs/postmortems/2026-09-09-rubric-selector-regression.md.

The broader assignment-type integration test now selects a dedicated shared rubric with the same Thesis/Grammar categories, preserving all prompt-version, evaluation, and tutor-module mapping assertions. Category-options coverage similarly verifies library selection preserves custom labels, feedback settings, and grammar highlighting. The focused browser gate includes these integration and library suites so obsolete inline-editor setup cannot escape local proof again.

Integration with PR359/361 preserves the added static Class Starter and Daily Pages reflection schemas and automatic seeding. The combined editor keeps shared selection and read-only schema display, plus assignment instruction overrides and default creation without inline setup. Separate reflection creation/reload coverage is retained alongside default and engagement creation tests. Bryant explicitly authorized resolving both tasks together on September 9.

## September 14 meeting delivery: authorized scoring and paste changes

Bryant authorized confirmed meeting implementation and release and resumed it September15. Source: https://fathom.video/calls/822769436. Acceptance: F01–F08 and F10–F11 in Record imports/sources/yawp/2026-09-15-handoff/reports/REQUIREMENTS-REVIEW.md.

- Daily Pages retains its registered identity, but Brian's authored engagement bands now accept whole-number points, so18 remains18/30. Rubric-schema and admin prompt tests intentionally change step10 to step1. Only explicitly opted-in fresh assignment configurations scale to configured10/90 totals; historical snapshots/old pins remain unchanged. Config, resolver, GA and scoring tests enforce those boundaries.
- Teachers see earned/possible points, including zero. The view-panel test intentionally replaces the old percentage assertion with equivalent points out of100 when no configured denominator exists. Browser coverage checks configured10/30/90/100/200 totals, exact manual points, save/reload/release and historical category snapshots. This does not remove paste percentages.
- New clipboard clients attach stable eventId while preserving the existing documentId/content/textLength fields; request assertions permit that extra field. The consolidated paste-alert tests add idempotency and cross-document rebinding protection and still cover method rejection, required fields, optional content, nonowner denial and membership-scoped ownership. Old clients without eventId continue writing ordinary alerts. Consolidation does not authorize weakening those guarantees.
- Teacher paste reports measure surviving marked characters against actual current/frozen visible text, count each character once, and explain incomplete historical tracking. They do not infer misconduct. Comments remain available. Private teacher notes remain excluded from student payloads and owner access across memberships.

September17 follow-up: Bryant explicitly approved removing the grading queue navigation organization gate and making the queue globally available to teachers. The org admin toggle and `Organization.gradingQueueNavEnabled` column are removed, and the browser proof intentionally changes from "rollout can disable it" to "students still cannot see the queue, while teachers always can from scoped work lists." Rollback is now an application/image rollback, not an organization setting.

This declaration does not grant production-QA tenant attestation, Internal proof exception, live rubric activation, customer-data access or permission to send invitations. All unrelated unresolved approval gates remain binding.

Released-grade activity browser checks likewise assert exact earned/possible totals for teacher and student displays on the seeded 100-point assignment. Raw numericPercentage database/audit assertions, comment confidentiality, and stale-revision protection remain unchanged.

## Assignment rubric grading modes

The approved default for assignment-level rubric grading is `step`, preserving
backward-compatible behavior. A step-mode rubric exposes only its authored
anchor scores, even when the assignment total is scaled (for example, 7/10 or
60/90 for the revised Daily Pages rubric). `bands` is an explicit assignment
override that permits scores within each rubric band.

The end-to-end grading proof also covers the existing “submit for grade” flow:
an assignment worth 100 points can use a 50-point AI rubric override, persist
the AI result as `50/50`, and display the projected assignment grade as `100`.
