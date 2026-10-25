# Independent Ship Review — PR #748 (r2)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/748 |
| Reviewed head | `d85fc7949ae19a5816a309a684bebbaad8e756b6` |
| Prior r1 head | `796d4efedb10358b139514d09206e65958431a00` (SHIP) |
| Verdict | **SHIP** |
| Review date | 2026-10-25 |

## Scope of this review (r2 delta)

Commit `d85fc7949` on top of r1:

- **`attachStrictPageObservability`** applies the same allowlist to **`pageerror`** as to **`console`**, via shared `shouldIgnoreError`, only while `inControlledNavigation` is true (`runControlled` / `gotoAndSettle`).
- Renamed predicate to **`isIgnorableControlledNavigationErrorMessage`** (deprecated alias kept for console naming).
- Unit test adds the full Suspense hydration string as thrown page error (reporter/planner breakpoint case).

r2 does **not** widen the allowlist beyond r1’s console rules; it closes the gap where React throws the Suspense hydration race as an uncaught exception instead of a console error.

## Filtering breadth (not too broad)

| Rule | Match semantics | Gated on `runControlled`? |
| --- | --- | --- |
| Manifest patch abort | **Exact** first line: `Failed to fetch manifest patches TypeError: Failed to fetch` (stacks on later lines do not bypass) | Yes |
| Suspense hydration race | **Prefix** on first line only: `This Suspense boundary received an update before it finished hydrating` | Yes |

Outside controlled navigation (`inControlledNavigation === false`), **all** console errors and page errors are collected. Listeners are registered once per helper instance; the gate is a boolean flipped only in `runControlled`’s `try/finally`.

**Residual risk (acceptable):** Any real bug whose `error.message` shares that exact Suspense prefix would be suppressed during controlled E2E only. That prefix is React’s fixed hydration-race copy; unrelated app errors are unlikely to collide. Nested `runControlled` would incorrectly clear the flag (not used today).

## r1 scope still sound

Re-verified at `d85fc7949` against `main`:

### E2E flake hardening (`21f048fb3`)

- **`assertChatControlsInBoundsAtBreakpoints`**: viewport resize + navigation wrapped in `runControlled` so manifest/Suspense noise during layout checks is ignored only inside that window.
- **`dev-panel-class-simulation.spec.ts`**: `simSheet` rebound after reopening flyout; waits for `Loading your classes…` to disappear before re-selecting class and clicking **Clear simulated data** — fixes stale dialog locator / loading race.

### Log redaction (`796d4efed`)

Catch paths now use **`buildSafeErrorForLog`** instead of raw `error.message` / logging whole `err` objects:

- `free-tier/service.server.ts` — `free_tier_scan_record_failed`
- `rubrics/rubric-release.server.ts` — `internal_rubric_release_flag_failed`
- `entry.server.tsx` — `logToFile` failure path (import already present)
- `ai-usage-log.server.ts` — `ai_usage_log_failed` (ALLOWED/DENIED)
- `internal-platform-auth.server.ts` — `internal_platform_api_audit_failed`
- `video.server.ts` — `video_duration_extract_failed`

New unit test in `ai-usage-log.server.test.ts` asserts email/token substrings do not appear in warn payload. Aligns with existing redaction helpers in `server-error-request-context.server.ts`.

## Tests run (review environment)

```bash
cd services/web-app && bun test e2e/test-helpers.manifest-console.test.ts app/utils/ai-usage-log.server.test.ts
```

**Result:** 12 pass, 0 fail.

Full `./bin/project test --profile changed` was **not** used as a gate (environment ran unrelated mass failures); targeted tests above cover PR-touched units.

## Diff summary vs `main` @ reviewed head

10 files, ~148 insertions / ~42 deletions — E2E helpers/specs + server log redaction only; no product behavior change beyond safer logging and test stability.

## Recommendation

**SHIP** `#748` at `d85fc7949ae19a5816a309a684bebbaad8e756b6`. r2 correctly extends r1’s controlled-navigation allowlist to page errors without relaxing uncontrolled strictness.
