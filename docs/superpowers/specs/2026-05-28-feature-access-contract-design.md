# Feature Access Contract

Date: 2026-05-28

## Features

Brian-facing rollout management has two product features:

- `assignments`: teachers can create assignments from assignment types. Students
  can still create ordinary documents from assignment types when this is off.
- `document_submission_grading`: students can submit documents, teachers can
  grade submissions, use GA, and release grades.

## Targets

New rollouts use `FeatureAccessTarget` rows at these scopes:

- `teacher`: enables all active classes taught by that teacher.
- `school`: enables every class in the school.
- `organization`: enables every school/class in the organization.

Existing `class` rows remain honored for backward compatibility, but the admin
UI no longer asks Brian to manage class rows.

## Resolution

Access is additive. A feature is enabled when any active target matches the
current context:

- organization target or legacy organization allowlist
- school target or legacy school allowlist
- teacher target
- legacy class target

Assignment creation remains blocked unless the selected class resolves enabled.
The assignment type page filters the class picker to enabled classes.

Document submission/grading uses the assignment class when a document belongs to
an assignment. Practice documents use the student's classes. A practice document
is submittable when at least one associated class resolves enabled. Teacher
grading actions are actor-scoped so a disabled teacher cannot grade solely
because another teacher on the student's class list is enabled.

## Legacy Settings

The old `Setting` allowlists remain active:

- `assignments_enabled_org_ids`
- `document_submission_enabled`
- `document_submission_enabled_school_ids`

They are read as broad compatibility fallbacks and should not be removed until
the replacement contract has been stable in production.
