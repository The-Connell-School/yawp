# AP History DBQ/LEQ Pilot Design

Issue: #215
Canonical local successor: `ws/summer-2026`
Risk: high (student data, AI extraction, authorization, schema, grading, UI)

## Outcome

Ship one default-off AP U.S. History pilot on the existing assignment,
document, tutor, submission, and grading domains. Teachers can assign a curated
DBQ/LEQ or import an approved public-domain PDF. Students read the immutable
source snapshot, draft, use an assignment-controlled tutor, submit, and reload
without duplicate documents or lost context. Grading continues to use the
versioned rubric snapshot already carried by the assignment.

## Source precedence and assumptions

The GitHub #215 acceptance criteria supersede the May library-first spec only
where they explicitly differ:

- PDF import is now in scope, but only as a separately gated import path.
- An assignment-level tutor on/off control is now in scope.
- APUSH-only, immutable snapshots, canonical tutor/grading behavior, generic
  domain boundaries, and default-off rollout remain authoritative.

The timer is a durable pacing aid. It does not auto-submit or lock the editor;
full exam enforcement remains out of scope.

## Historical PR preservation matrix

### #191 — canonical UI reference

Preserve:

- AP snapshot tutor grounding.
- APUSH prompt-library browsing and filtering.
- source preview in assignment creation.
- production DBQ workspace adapter with the existing editor/tutor/comments.
- source image/provenance presentation where the current snapshot supports it.

Drop:

- public marketing/info route drift.
- duplicate foundation changes already superseded on the Summer branch.
- prototype-only sample tutor/editor behavior.

### #198 — experimental authoring/data stack

Preserve by reimplementation:

- deterministic local/E2E APUSH fixtures.
- PDF extraction contract.
- validated custom-snapshot construction.

Drop:

- AP Euro/AP World expansion.
- free-form blank builder and per-source image upload.
- student self-serve library.
- raw system prompts, PDF content, or provider responses in LLM logs.
- large bundled image corpus and hero-art drift.

### #202 — writing-process tutor stack

Preserve:

- APUSH DBQ/LEQ-aware module guidance where it can use shared module/session
  infrastructure.
- small shared tutor interaction hardening that remains backward compatible.

Drop:

- unrelated shared-editor behavior unless required by the pilot flow.

### #205 — source-reader experiments

Preserve as test/reference only:

- accessibility assertions and tutor-conversation hardening.

Drop:

- fullscreen mode, annotations/highlights, preview-container changes, and all
  duplicated #202 commits.

## Data contracts

### Rollout

- AP History visibility continues to use the existing
  `OrganizationAssignmentType` link. No link means default-off.
- `Organization.apHistoryPdfImportEnabled` is additive and default false.
- `AP_HISTORY_PDF_IMPORT_ENABLED=false` is a kill switch only; it can never
  enable a tenant whose database flag is false.
- Removing the assignment-type link or disabling PDF import is reversible and
  leaves historical assignments readable.

### Assignment tutor policy

- Add generic `Assignment.tutorEnabled Boolean @default(true)`.
- Library and imported AP assignments accept an explicit teacher selection.
- Document loaders hide the tutor when false.
- The tutor action joins the module session to the requesting membership and
  assignment and rejects disabled/cross-membership requests server-side.
- Existing assignments retain tutor-on behavior.

### Snapshot v2 and backward compatibility

New assignments write AP snapshot schema version 2. Reads continue to accept
version 1.

Version 2 adds:

- `origin: "library" | "pdf-import"`
- public-domain license name/URL and provenance URL on every DBQ source
- optional import digest metadata (SHA-256, never the raw PDF)
- the existing prompt, APUSH period, reasoning skill, rubric, timing, and
  source content

Library rows gain additive nullable license fields so old rows and exported
fixtures remain readable. New seed data supplies complete public-domain
metadata. Student display, tutor grounding, and grading read the assignment
snapshot, never the live library row.

### Durable timer

- Add nullable `Document.apHistoryTimerStartedAt`.
- A membership-scoped action sets it once for timed AP assignments.
- Countdown derives from the immutable snapshot duration and server timestamp.
- Reload resumes the same countdown. Repeated start calls are idempotent.
- Expiry is announced but does not auto-submit.

## PDF import and network boundary

The browser uploads a PDF to an authenticated AP-specific route. The route:

1. requires an active teacher membership, a taught class, AP assignment-type
   access, tenant PDF-import flag, and environment kill switch;
2. validates PDF type, magic bytes, and a 10 MiB limit;
3. reserves tenant/member AI capacity before the provider call;
4. sends the PDF through the unchanged Anthropic SDK;
5. validates a strict APUSH DBQ/LEQ response;
6. returns editable extracted fields but stores no PDF;
7. creates an assignment only after a public-domain attestation and HTTPS
   provenance URL are supplied;
8. stores only metadata/digests in LLM logs.

The network proof runs a real local Anthropic-compatible HTTP service and
captures the unchanged SDK request. Deterministic fixtures cover DBQ, LEQ,
malformed JSON, transient/exhausted 500, 429, and connection drop.

## UI structure

- Teacher desktop: APUSH filter rail and compact prompt list.
- Teacher mobile: filter sheet; assignment/import sheets use existing Yawp
  sheet conventions.
- DBQ student desktop: tutor, sources, editor/comments using #191's production
  seams, with keyboard-resizable separators.
- DBQ student mobile: explicit Sources / Write / Tutor affordances; no hidden
  required panel and no horizontal overflow.
- LEQ: prompt/timer plus the generic editor/tutor without an empty source rail.
- Source citations use one consistent numbering scheme and expose attribution,
  license, and provenance links.
- Tutor-off assignments render a clear teacher-controlled notice and no chat
  affordance.

## Security and privacy invariants

- Teacher class and assignment-type authorization is tenant-scoped.
- Uploaded provider output never chooses tenant, class, rubric, tutor policy,
  license, or provenance.
- All client source/prompt JSON is schema-validated and bounded server-side.
- No raw PDF, student draft, provider response, system prompt, or extracted
  source body is written to `LlmLog`.
- Tutor sessions cannot be addressed across memberships or tenants.
- Read-only impersonation/student-preview writes remain blocked.
- Submission/grading use the assignment snapshot and existing grade authority.

## Human review markers

These do not block implementation or later Summer issues:

- curriculum and AP rubric review;
- public-domain/license review of curated fixtures and pilot import policy;
- privacy/retention review for PDF-derived assignment content;
- manual screen-reader/keyboard review;
- canonical PR, preview, stale-PR closure, merge, migration, release, and
  deployment approvals.
