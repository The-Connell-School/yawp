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
