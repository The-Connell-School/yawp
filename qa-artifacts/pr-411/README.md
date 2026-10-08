# PR 411 QA artifacts (head `831e8884` / `f5452fad`)

Headless preview script: `services/web-app/scripts/preview-holistic-qa.mjs` (env-gated access).

Preview could not locate **Holistic Tier Demo (Preview)** in teacher documents at capture time; see `debug-class-documents.png`.

Holistic teacher/student/class UI evidence: CI `teacher.holistic-grading.spec.ts` screenshots on green E2E runs (after 60m job timeout fix).

Root cause for preview `33% (F)` at `eaab8205`: missing `scoringMode: holistic_tier` → weighted fallback; see PR #411 body.
