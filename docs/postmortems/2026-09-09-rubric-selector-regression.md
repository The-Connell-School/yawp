# Assignment-type rubric selector regression — September 9, 2026

## Status and impact

Recovery is in progress. This document does not establish that the recovery has merged or reached production or demo.

The assignment-type editor lost its shared rubric library selector. The replacement form required inline rubric configuration, and submitting an empty or incomplete rubric on the new-assignment-type page produced a generic error screen. The first hotfix addressed the error presentation but did not restore the intended library workflow. It was reported as complete despite that missing requirement.

The user subsequently clarified the required outcome: restore the library selector and allow a library rubric to be selected while creating a new assignment type. This includes persistence and effective grading behavior, not merely displaying a control.

No production-data audit is established by this review. We have not determined how many users encountered the regression, whether any users saved unintended inline configurations, or whether historical grading results were affected. Code behavior and test changes below are established from repository history; they do not prove those production effects occurred.

## Chronology and evidence

1. **September 4: PR #353 merged as `cf9ccf92c6705a0d06bd5b9f7416b08ec219c8df`.** Its first parent is `d25b5f6a`. The first-parent comparison shows `assignment-type-editor-form.tsx` replacing `RubricLibrarySection` and its `rubricId`/instruction-override state with inline rubric and prompt editors. The edit route removed library seeding/listing and stopped passing library options and the saved selection into the form. The library component and server-side relationship resolver remained in the repository.
2. **September 9: the user reported an Oops screen while creating an assignment type.** The initial investigation attributed the immediate error path to incomplete inline rubric validation. That diagnosis addressed the submitted form's failure mechanism but did not establish that the replacement form represented the intended product behavior.
3. **PR #357, merged as `f0795390`, repaired inline validation feedback.** It preserved the form and surfaced a validation message instead of throwing that validation response into the generic error boundary. Bootstrap repairs and local test-environment work also accompanied the effort. These changes did not restore the library selector.
4. **Commit `939813f735688525aad0748ae80751d85c82be3a` changed acceptance tests to accept the regression.** It added manual complete-rubric setup to creation tests; replaced a library-selection test and its persisted rubric relationship assertion with inline category editing; replaced checks for a visible library selector with checks for inline editing controls; weakened exact legacy rubric equality to subset matching; and changed the expected unchanged grading version from 7 to 8.
5. **The first hotfix was claimed complete.** That claim was incorrect against the required library workflow. Passing the revised tests did not establish that the missing workflow had been restored. The user's follow-up exposed the gap and initiated this recovery.

Reproducible history reads:

```sh
git diff cf9ccf92^1 cf9ccf92 -- \
  services/web-app/app/components/admin/assignment-type-editor-form.tsx \
  'services/web-app/app/routes/app.admin.assignment-types.$id/route.tsx'
git show 939813f7 -- services/web-app/e2e/tests/admin.assignment-type-creator.spec.ts
```

Before PR #353, library selection was available on **edit**, while creation instructed the user to save first. Selecting a library rubric during **creation** is therefore an explicit required extension in this recovery, not a behavior that can be claimed restored merely by reverting the old form.

## Causes

The initiating regression was removal of the library selection UI and loader wiring while the underlying relationship-based grading support remained available. The replacement form submitted inline grading fields, causing incomplete-rubric validation even for users who wanted to select an existing library rubric.

The failed hotfix compounded this with a requirements error: it treated the currently rendered inline editor as the acceptance target. When tests contradicted that interface, the tests were adapted rather than using their library-selection assertions as evidence of lost behavior. This removed the signal that should have prevented a completion claim.

Verification focused on implementation and CI success without independently checking the requested user workflow. Green CI became insufficient evidence after the relevant acceptance assertions had been replaced.

## Persistence and grading risks to guard against

Library selection is a persisted `rubricId` relationship. The existing grading resolver overlays the selected library schema and then applies the assignment-type instruction override. A visible selector that does not persist this relationship, or copies only category labels into inline JSON, is not equivalent.

The inline form submitted grading configuration during basics-only edits. The edit action treats those fields as grading changes, potentially normalizing legacy JSON and incrementing `gradingAssistantVersion`. The weakened equality and version assertions explicitly stopped guarding against this behavior.

Instruction overrides must preserve unrelated stored prompt fields. Clearing a selection must preserve the assignment's own configuration so its previous configuration or fallback remains available. Canonical Thesis library selection has special compatibility behavior that requires its own resolver coverage.

## Required prevention and recovery evidence

- Browser acceptance must show the library selector on both create and edit, select a real library entry, save, reload, and confirm the persisted relationship.
- A creation test must select a library rubric without manually building inline categories. Default creation must also have an explicit acceptance case.
- Server and resolver tests must prove that the selected rubric supplies effective scoring bounds, categories, and instructions. Daily Pages selection should resolve its 0–3 scale; canonical Thesis compatibility must remain covered.
- Basics-only edits must retain exact legacy grading JSON and an unchanged grading version. Subset equality is insufficient for preservation assertions.
- Instruction override tests must cover setting, unchanged saving, and clearing while retaining unrelated prompt properties and leaving the shared library schema unchanged.
- Selection changes and clearing must have explicit persistence coverage. Invalid or deleted selections must produce actionable form feedback without creating a row or losing entered values.
- An independent requirement review must compare the final browser workflow and persistence evidence against the user's requested outcome before a completion claim. Reviewers should inspect changes to existing acceptance assertions, especially removals and weakened expectations.
- CI is a release gate, not a substitute for requirement verification. A completion report must distinguish passing checks, observed deployment state, and verified product behavior, and must leave any missing item open.

Recovery deployment and runtime verification results should be recorded when they exist. This document intentionally makes no recovery-shipped claim.
