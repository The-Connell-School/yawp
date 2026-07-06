# AI Workbench Real Pages Design

## Goal

The admin AI workbench should stop recreating tutor and grading screens inside the admin area. It should create isolated sandbox data and send admins into the existing document and submission pages so testing uses the same application code paths staff and students already use.

## Product Shape

The assignment-type AI workbench is a launcher. Admins choose a sample student name, sample document text, strictness, and optional version. A tutor launch creates a sandbox `Document` and redirects to `/app/documents/:id`. A grading launch creates a sandbox `Document` plus a sandbox `Submission` and redirects to `/app/submissions/:submissionId?edit=1`.

The existing document and submission pages remain the primary UI. They only gain a small sandbox banner with an exit link back to the assignment type workbench. They should not duplicate admin-only prompt previews, system prompts, or custom workbench panels.

## Data Model

Sandbox documents and submissions need explicit provenance so they can be excluded from normal student/teacher document lists while still being openable by direct URL. `Document` and `Submission` get `isAiSandbox` plus optional `aiSandboxRunId` links to `AssignmentTypeAiEvaluationRun`.

Each launch creates a fresh evaluation run. This keeps tests reproducible and gives admins a history of exactly which assignment type version, sample document, strictness level, and sandbox records were used.

## Safety

Normal app lists filter out `isAiSandbox` records. Direct routes can open sandbox records because admins are already allowed through those loaders. The grading API continues to block teachers/admins from grading their own normal documents, but allows the exception when the submission belongs to an admin-owned AI sandbox document.

## Testing

Route tests cover launcher redirects and sandbox record creation. Grading API tests cover the sandbox exception. E2E covers the admin launching into the real document page and real submission grading page.
