# Independent Ship Review — PR #744 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/744  
**Branch:** `cursor/quality-sweep-8-log-redaction-deps-2902` → `main`  
**Reviewed SHA:** `00d810e53bb031c85035bb5bc06ec2c5a9e48086`  
**Base (at review):** `e2b8a8a3582054ece752f5cbdff14abd349eeceb`  
**Remote HEAD at review time:** matched `00d810e53bb031c85035bb5bc06ec2c5a9e48086` (unchanged).

BLOCK

## Scope

Diff vs `main` is limited to twelve files and matches the stated quality-sweep #8 scope: server log redaction, Bun overrides for transitive deps, and tests. No UI, locked-dashboard, Kevin/#608, or Terraform changes.

| Area | Files |
| --- | --- |
| Overrides | `package.json`, `bun.lock` |
| Redaction | `feature-flags.server.ts`, `internal-feature-flags-http.server.ts`, `internal-free-tier-http.server.ts`, `rate-limit.server.ts`, `blackboard-ags.server.ts`, `teacher-training-video-link.server.ts` |
| Tests | matching `*.test.ts` files above plus `server-error-request-context.server.test.ts` |

## Redaction assessment

- **Shared helper:** New and updated `console.error` / `console.warn` paths use existing `buildSafeErrorForLog` instead of raw `Error` objects or `error.message` alone. Prisma initialization errors omit connection strings (name/code/meta/sanitized stack only).
- **Rate limits:** `single_flight_failed_open`, `rate_limit_decision_log_failed`, `rate_limit_failed_open`, and `rate_limit_failed_closed` no longer log the raw `error` object.
- **Blackboard AGS:** Upstream HTTP failures use `agsUpstreamHttpError`, exposing HTTP status and response body **byte count** only—not response text (tokens/PII). Contract test confirms token endpoint errors omit mocked secret bodies.
- **Teacher training video:** Signing failures log structured `teacher_training_video_sign_failed` with `buildSafeErrorForLog`; test asserts tokens and email are absent from log output.
- **Operability:** AGS and HTTP paths retain status codes and body sizes; non-Prisma errors still carry redacted messages where applicable.

## Dependency overrides

Root `overrides` add patch/minor-safe pins only (same major lines as resolved in lockfile):

- `compression` ^1.8.2 (lock: 1.8.2)
- `proxy-addr` ^2.0.8 (lock: 2.0.8)
- `ws` ^8.21.0 (lock: 8.22.0, still 8.x)

No new secrets; existing `axios` override unchanged.

## Tests

Ran at reviewed SHA (PR-related files only):

`bun test app/domain/feature-flags/feature-flags.server.test.ts app/integrations/blackboard-ags.server.test.ts app/utils/server-error-request-context.server.test.ts app/utils/teacher-training-video-link.server.test.ts`

- All **new/updated redaction tests pass** (feature-flag prisma string test, AGS token body omission, `buildSafeErrorForLog` prisma init test, teacher-training sign failure test).
- Unrelated failures in the same feature-flags file (free-tier / unified-sign-on expectations vs runtime non-production defaults) are environmental on this runner, not introduced by this diff.

## Blockers

1. **TypeScript (`tsc`) fails on reviewed SHA.** `react-router typegen && tsc` reports:

   `app/integrations/blackboard-ags.server.test.ts(13,22): error TS2352` — assigning `mock(async () => Response)` to `typeof fetch` is rejected (`preconnect` missing; types do not overlap). `main` typechecks clean; this error is introduced by the new AGS redaction test.

   GitHub check **TypeScript** on #744 was failing at review time (consistent with the above).

**Required fix:** Adjust the fetch mock typing (e.g. cast via `unknown`, use a partial stub, or follow an existing fetch-mock pattern elsewhere in the repo) so `web-app:typecheck` passes.

## CI note

Other PR checks were still running at review time; the TypeScript failure alone is sufficient to block merge until fixed.
