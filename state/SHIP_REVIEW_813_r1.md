# Independent Ship Review — PR #813 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/813 |
| Title | fix: redact domain sign-on/student-join error.message (#8ab) [skip preview] |
| Branch | `cursor/redact-domain-signon-student-join-5cca` |
| Base (LIVE at review) | `491f5db47db8de8aa69f64c8742ebcf8b7a8bd3c` (#811) |
| Reviewed head | `d568d0b0f91b1e285cb86d7c26b947768bc1dada` |
| Prior application commits on branch | `f8b17826c` (fix), `d568d0b0f` (tests) |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-26 |

## Verdict

**SHIP** on head `d568d0b0f91b1e285cb86d7c26b947768bc1dada`.

## Freshness

GitHub `headRefOid` for PR #813 matches the requested review SHA. Diff vs merge-base with `origin/main` is exactly four files (+133/−3); no other commits on the feature branch.

## Scope

| File | Change |
| --- | --- |
| `services/web-app/app/domain/unified-signon/entry.server.ts` | FlowError JSON `error` field |
| `services/web-app/app/domain/free-tier/student-join.server.ts` | `FreeClassSeatError` client `error` field |
| `services/web-app/app/domain/unified-signon/entry.server.test.ts` | New canaries (3 tests) |
| `services/web-app/app/domain/free-tier/student-join.server.test.ts` | New canaries (2 tests) |

No schema, flags, routes, lesson planner, or platform-enhancements surfaces touched.

## Kevin / #608

PR #608 (“Platform enhancements behind platform-enhancements flag”) and Kevin-owned product areas (lesson planner stack, library folders, etc.) are **unchanged** by this diff. Remaining `error.message` usage in `unified-signon/backend.server.ts` (internal FlowError reshaping / invitation checks) is explicitly out of scope per the application PR description and was not modified.

## Helper correctness

Both call sites use `safeDomainErrorTextForClientResponse` from `~/utils/server-error-request-context.server`, which:

1. Runs `redactFreeformMessage(error.message)` (tokens, emails, URLs, length cap).
2. Returns trimmed redacted text when non-empty.
3. Otherwise returns the supplied fallback.

This is the established pattern from #806/#808/#811 for teacher-safe validation copy with redaction, distinct from `safeErrorTextForClientResponse` (fallback-only).

**Sign-on (`entry.server.ts`):** Fallback `'This sign-in session expired. Please start again.'` applies only when the FlowError message is empty after redaction—not for intentional validation strings such as `'Invalid request origin.'`.

**Student join (`student-join.server.ts`):** Fallback `FREE_CLASS_CLASS_FULL_MESSAGE` (`'This class is full. Ask your teacher for help.'`) preserves the teacher-facing class-full copy when the seat error message is empty; normal `FreeClassSeatError` messages with that constant pass through unchanged.

## Sign-on UX

| Behavior | Expected | Verified |
| --- | --- | --- |
| `fieldErrors` present | Top-level `error` is `''`; field map returned | `entry.server.test.ts` — `dispatchUnifiedLogin leaves error empty when fieldErrors are present` |
| Intentional FlowError copy | Unredacted validation text in `error` | Same file — `'Invalid request origin.'` preserved |
| Accidental leak (Prisma/token/email) | Substrings redacted; non-empty safe text | Same file — secrets absent from JSON `error` |
| Session-style empty message | Fallback session-expired copy | Helper unit tests in `server-error-request-context.server.test.ts`; wiring uses correct fallback string in `entry.server.ts` |

Status codes and optional `retryAfterSeconds` / `Retry-After` headers are unchanged.

## Student-join class-full copy

Before: `error: error.message` on `isFreeClassSeatError` path.

After: `safeDomainErrorTextForClientResponse(error, FREE_CLASS_CLASS_FULL_MESSAGE)`.

Canary tests assert `FREE_CLASS_CLASS_FULL_MESSAGE` is returned for a normal seat-cap error and that synthetic sensitive substrings are redacted while keeping non-empty output. Existing join tests (budget, handles, enrollment) still pass.

## Test quality

- **Integration-level:** `entry.server.test.ts` exercises `dispatchUnifiedLogin` with mocked auth/gate/backend—covers the actual JSON response path, not only the helper in isolation.
- **Contract-level:** `student-join.server.test.ts` canaries document the exact helper + fallback pairing used in production code (appropriate given the catch block is a thin wrapper).
- **Regression depth:** Helper behavior for redaction vs fallback already covered in `server-error-request-context.server.test.ts` (included in local run).

## Findings

### Blockers

None.

### Non-blocking notes

1. **Out-of-scope leaks:** `backend.server.ts` still forwards/checks raw `error.message` internally; follow-up pass noted in PR #813 body.
2. **CI:** GitHub Actions for PR #813 were in progress at review time (TypeScript job had reported fail while run was still active). Local verification below is on the reviewed head’s test surface; full green CI remains the merge gate outside this review.

## Verification (reviewed head `d568d0b0f`)

```text
~/.bun/bin/bun test \
  services/web-app/app/domain/unified-signon/entry.server.test.ts \
  services/web-app/app/domain/free-tier/student-join.server.test.ts \
  services/web-app/app/utils/server-error-request-context.server.test.ts
# 25 pass, 0 fail

rg 'error\.message' \
  services/web-app/app/domain/unified-signon \
  services/web-app/app/domain/free-tier
# Matches only unified-signon/backend.server.ts (out of scope)
```

Detached checkout at `d568d0b0f91b1e285cb86d7c26b947768bc1dada` used for diff inspection; tests executed with files present at that revision.

## Recommendation

**SHIP** PR #813 when required CI checks are green. This review does not merge #813 and does not modify the application branch.
