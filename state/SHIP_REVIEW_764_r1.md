# Ship Review — PR #764 (round 1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/764 |
| Branch | `cursor/e2e-join-link-wait-e051` |
| **Reviewed head** | **`f25a8cdcee59910e8b342fa5051f2cc215835593`** |
| Verdict | **SHIP** |
| Reviewer | Independent read-only ship review (Cloud Agent) |
| Date (UTC) | 2026-10-25 |

## PR claim

E2E-only hardening for `auth.free-tier-handle-join` after #762 still flaked on main: CI artifacts showed empty **Display name** and client **"Name is too short"** while handle/password were filled — a hydration race on autofocus name fill after `domcontentloaded`, not a join product failure.

Add shared helpers `fillFreeTierJoinForm` / `submitFreeTierJoinAndExpectApp`, use them in the smoke spec, no product or feature-flag changes.

## Head drift check

GitHub `headRefOid` for PR #764 matches the mandated review head **`f25a8cdcee59910e8b342fa5051f2cc215835593`**. No drift; review proceeded.

## Diff scope

Single commit on reviewed head. Two files changed (+75 / −8):

| File | Role |
| --- | --- |
| `services/web-app/e2e/test-helpers.ts` | Join form fill/submit helpers; also extends `TestHelpers.waitForEditorReady()` with ProseMirror/sync readiness wait |
| `services/web-app/e2e/tests/auth.free-tier-handle-join.spec.ts` | Uses join helpers; replaces `networkidle` with `domcontentloaded` + visible login/join anchors; bounded retry for teacher documents tab student name |

No application routes, flags, or server join logic changed.

## Review checklist

### 1. Helpers — bounded retries, still fail on invalid form, require `/app`

| Check | Result |
| --- | --- |
| `fillFreeTierJoinForm` waits for join heading (15s) before filling | Pass |
| Each field retried inside `expect(…).toPass({ timeout: 15_000 })` with `fill` + `toHaveValue` | Pass (bounded per field, not unbounded spin) |
| Fields: display name, handle, password, confirm password | Pass |
| `submitFreeTierJoinAndExpectApp` asserts **"Name is too short"** not visible before submit | Pass (invalid short/empty name blocks submit path) |
| Join button must be enabled and labeled **Join class** before click | Pass |
| Submit races `waitForURL(/app…)` (default 60s) with click, then `toHaveURL(/\/app/)` (5s) | Pass |
| No retry loop around failed navigation that would swallow a broken join API | Pass (navigation still hard-fails on timeout) |

### 2. Does not mask a real join bug

| Check | Result |
| --- | --- |
| Retries address **value not sticking** after hydration, not bypassing validation | Pass |
| Server-side join failure still surfaces as navigation timeout or post-submit URL assertion failure | Pass |
| Pre-submit client validation still enforced via visibility of **Name is too short** | Pass |
| Product join token / form handlers untouched | Pass |

### 3. Scope / drive-bys

| Check | Result |
| --- | --- |
| E2E / test-helper layer only | Pass |
| `waitForEditorReady()` editor sync wait in same helper file is **not** used by this spec | Note (harmless E2E infra drive-by; does not affect join assertion semantics) |
| Spec additionally hardens teacher/student login `goto` and documents-tab name visibility | Note (same flake family as #762; still E2E-only) |
| No workflow, deployment, or production feature-flag changes | Pass |

### 4. Tests adequate (read-only review)

No new unit tests (Playwright smoke is the proof surface). Helpers are deterministic and mirror the failure mode described in PR body and main CI artifact (empty display name at submit).

Targeted E2E execution was not run in this review environment (full smoke requires project bootstrap + shard fixtures). CI on PR #764 is the intended gate for `auth.free-tier-handle-join.spec.ts` (smoke shard 4).

### 5. Yawp! copy rules (product name / “AI”)

Only E2E selectors and existing user-visible join copy (**Create your student account**, **Join class**, validation strings). No product marketing copy changes. N/A.

## Decision

**SHIP** at head **`f25a8cdcee59910e8b342fa5051f2cc215835593`**.

Focused E2E stabilization: retry until RVF-bound fields hold values, assert form validity before submit, and require authenticated `/app` landing without changing the join product path. Minor helper-file editor readiness wait and extra spec navigation waits are acceptable E2E-only scope.
