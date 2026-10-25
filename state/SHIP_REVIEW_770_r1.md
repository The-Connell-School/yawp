# Independent Ship Review — PR #770 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/770 |
| Title | Quality sweep #8h: harden API-domain error logging |
| Branch | `cursor/quality-sweep-8h-api-error-logging-c6ec` |
| Base | `main` @ `455993d5a328bf10e1edde37e250ff10aca8e536` |
| Reviewed head | `8f3fd47b884a66d25f104eb6aa6f068d6149c0eb` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-25 |

## Verdict

**SHIP** on head `8f3fd47b884a66d25f104eb6aa6f068d6149c0eb`.

## Freshness

GitHub `headRefOid` for PR #770 and local `origin/cursor/quality-sweep-8h-api-error-logging-c6ec` both resolve to `8f3fd47b884a66d25f104eb6aa6f068d6149c0eb` (unchanged from the review request). `origin/main` remains at `455993d5a328bf10e1edde37e250ff10aca8e536` (quality sweep #8g / #768). Merge-base with `main` is that same tip. No freshness block.

## Scope (2 files, +64 / −2)

1. **`api.domain.release-grades/route.ts`**: Blackboard AGS passback prefetch `catch` logs stable event `blackboard_ags_passback_on_release_failed` with `error: buildSafeErrorForLog(error)` instead of `{ err }` and a human-readable prefix string.
2. **`api.domain.release-grades/route.test.ts`**: New test mocks passback prefetch failure (`findMany` rejection with token-like message), asserts release still succeeds, warn payload uses redacted message metadata, and raw secret substring does not appear in serialized log args.

No Terraform, secrets, Kevin PR scope, or unrelated UI changes. Diff is limited to the deferred #768 API-domain item described in the PR body.

## Correctness & safety

### Call-site hardening

- Imports `buildSafeErrorForLog` from the shared server utility introduced in quality sweep #8f (#766), matching `grade-essay-ai` and other hardened routes.
- The catch wraps the Blackboard mock passback loop only; grade release success path is unchanged—failures in passback remain non-fatal (warn + continue to success response), preserving prior behavior aside from log shape.
- Replacing raw `{ err }` avoids DevTools / log aggregators serializing full `Error.message`, stack, and nested cause text that may contain LTI tokens or provider payloads.

### Test coverage

- Test exercises the failure path by rejecting the second `findMany` (post-transaction prefetch) while keeping the release transaction path successful.
- Asserts event key `blackboard_ags_passback_on_release_failed` and `buildSafeErrorForLog` redaction (`[redacted-token]` in message, no `super-secret-value` in `JSON.stringify` of warn args).

### Regressions considered

- **Log aggregation**: Event string changed from `Blackboard AGS passback (mock) on release failed` to snake_case—consistent with sweep #8g UI/server event naming; operators may need to update ad-hoc log filters (non-blocking nit).
- **Under-logging**: Operators lose raw exception text in this warn—intentional and aligned with #766 / #768 policy.

## Verification

Independent checks at reviewed head (`8f3fd47b8`):

```text
/home/ubuntu/.bun/bin/bun test app/routes/api.domain.release-grades/route.test.ts
# 15 pass, 0 fail
```

Manual diff audit `main...8f3fd47b884a66d25f104eb6aa6f068d6149c0eb`: only the two files above; grep confirms no additional hunks under `api.domain.*`.

GitHub Actions for PR #770 at review time: **Changed paths** and **Preview tooling** green; TypeScript, Prisma migrations, E2E shards, and browser jobs still **pending** (0 failed). Merge after required CI is green on the same head.

## Nits (non-blocking)

- Normalize remaining human-readable Blackboard mock warn prefixes elsewhere (e.g. `grade-essay-ai`) in a follow-up for log aggregation consistency, as noted in the PR deferred section.
- Broader non–`api.domain` route audit remains out of scope for this sweep.

## Recommendation

Approve and merge PR #770 when CI is green on head `8f3fd47b884a66d25f104eb6aa6f068d6149c0eb`. This review did not modify application code on the feature branch.
