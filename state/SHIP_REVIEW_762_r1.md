# Independent Ship Review — PR #762 (r1)

**Verdict: SHIP**

**Head SHA reviewed:** `1bb0dd0b986a9abafec8ebc2525c48d25fb253f4`  
**Base reviewed against:** `main` @ `e10c1f86d194f9f806f445bc3658cd124bc9c5bb`  
**PR:** https://github.com/The-Connell-School/yawp/pull/762 — *Quality sweep #8e: handle-join CI hardening + log redaction leftovers*

## Scope summary

Nine files, +61 / −21. Two themes only (matches PR intent):

1. **E2E flake hardening** — `auth.free-tier-handle-join.spec.ts` and shared `waitForEditorReady()`.
2. **Server log redaction leftovers** — catch-path / LLM failure logs on seven API routes; no response-body or UI copy edits.

No feature flags, auth product logic, or advisory-lock behavior changes.

## E2E — `auth.free-tier-handle-join` + `waitForEditorReady()`

| Change | Assessment |
|--------|------------|
| Replace `networkidle` after join/login navigations with `domcontentloaded` + visible form fields (15s) | **Timing-only.** Avoids CI hangs on background requests; still blocks until the UI is interactable. |
| Student post-join: `waitForURL(/\/app/, { timeout: 30000 })` | **Bounded redirect wait**; fails if join does not land in app. |
| Teacher documents tab: `toPass({ timeout: 20000 })` with conditional reload when display name missing | **Bounded poll** for eventual consistency after submit; still fails if the name never appears (real regression). |
| `waitForEditorReady()` adds ProseMirror `pmViewDesc` + `dataset.syncReady === 'true'` (15s), same predicate as `openDocument()` | **Aligns with existing editor bar** documented in `test-helpers.ts`; reduces typing-before-sync races. Does not skip the 500ms settle that `openDocument()` uses after navigation — acceptable because this spec already waited for document URL before calling `waitForEditorReady()`. |

**Shared helper blast radius:** `waitForEditorReady()` is also used by assignment-start, revision-flow, document regression/invariants, local-first persistence, and AP history specs. The stricter wait is **test-only** and surfaces real editor/sync bugs rather than masking them (tests fail if sync never becomes ready).

**Product / flag behavior:** Unchanged. Free-tier handle join serialization remains in server code (`registerFreeTierStudent` advisory lock); this diff does not touch it.

## Log redaction

All touched hunks route errors through existing helpers in `server-error-request-context.server.ts`:

| File | Before | After |
|------|--------|-------|
| `api.internal.v1.audit`, `api.internal.v1.stats.grading` | Raw `error.message` / string in structured log | `buildSafeErrorForLog(error)` |
| `api.domain.rubric-copy-sources`, `api.domain.tutor-response` | Raw `console.error(..., error)` or bare `console.error(error)` | Structured event + `buildSafeErrorForLog` |
| `api.ap-history.extract-document`, `api.domain.assignment-pdf-extract`, `api.domain.rubric-extract` | Raw message in LLM log `error` field | `safeErrorTextForLog(error)` |

**Client JSON / UI:** Unchanged on every reviewed route (e.g. tutor still `{ error: 'An error occurred.' }`, rubric-copy-sources still fixed `message` string). No new secrets in logs relative to the established redaction helpers; unit coverage for `buildSafeErrorForLog` / `safeErrorTextForLog` already exists.

## Tests / verification

| Area | Status |
|------|--------|
| New unit tests in this PR | None required for log wiring (helpers pre-tested). |
| PR-suggested tests | `server-error-request-context.server.test.ts` — **10/10 pass** locally (this review). |
| E2E proof | CI shard 4 includes `auth.free-tier-handle-join.spec.ts` — see CI note. |

**Local verification (this review):** Static diff review at head `1bb0dd0b…`; `./bin/project doctor` reports Docker unavailable (no full Playwright run locally). Did **not** run E2E smoke locally.

## Risks (non-blocking for r1)

- **Broader `waitForEditorReady()`:** Slightly stricter editor gate across several specs; may expose latent sync timing issues as failures (desirable hardening, not silent pass).
- **Documents tab reload loop:** Theoretically could pass after a slow eventual-consistency window; 20s cap still fails on persistent bugs.
- **Log-only route edits:** Operators lose raw exception dumps on the touched paths; must use redacted structured fields — intentional continuation of #690/#752/#754.

## CI note

**Do not merge PR #762 from this review alone.** Platform merges after **SHIP + green CI on the exact head**.

At review time, head `1bb0dd0b…` had **ʦ TypeScript: pass** and several browser shards green; **🧪 E2E smoke (shard 4)** (contains `auth.free-tier-handle-join.spec.ts`) was still **pending** on run 40196465644. Re-check shard 4 before merge.

Reviewer did not merge #762.
