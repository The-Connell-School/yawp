# PR #374 preview QA captures

Headless Playwright runner: `run-preview-qa.mjs` (requires `PREVIEW_URL` and `PREVIEW_ACCESS_CODE` env vars).

Tail-only recapture (07b–08d): `capture-tail-preview-qa.mjs`.

Measured lesson cost: see `cost-measurement.json` (**$0.6827** for the captured 7-call lesson on pr-374 preview).

Class Summary + planner hand-off: `07b-class-summary-ready.png`, `07c-planner-from-class-summary.png` (preview-only `seed-preview-planner-qa` on PR databases — not demo).

Stacked packet PDF: `05-packet.pdf` is **5 pages**; runner asserts page count and records `packetPdfMd5` in its JSON summary.

Released exit-ticket grade: `08d-student-released-grade.png` after confirming the Release Grade dialog (see `release-grade-helpers.mjs`).
