# Independent Ship Review — PR #748 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/748  
**Branch:** `cursor/quality-sweep-8-ci-logs-98bd` → `main`  
**Reviewed SHA:** `796d4efedb10358b139514d09206e65958431a00`  
**Base (at review):** `a0bf8e2771d83f1beea9ca635350744bf370596f`  
**Remote HEAD at review time:** matched `796d4efedb10358b139514d09206e65958431a00` (unchanged).

**SHIP**

## Scope

Full diff vs `main`: **10 files**, +128 / −41 lines, **2 commits**. Touches server-side log redaction, one new unit test, E2E helpers/specs only. **No** React route/component product UI, **no** `package.json` / lockfile changes, **no** Kevin / #608–style locked-dashboard work.

| Area | Files |
|------|--------|
| Log redaction | `ai-usage-log.server.ts`, `free-tier/service.server.ts`, `internal-platform-auth.server.ts`, `rubrics/rubric-release.server.ts`, `video.server.ts`, `entry.server.tsx` |
| Tests | `ai-usage-log.server.test.ts`, `e2e/test-helpers.manifest-console.test.ts` |
| CI flake hygiene | `e2e/test-helpers.ts`, `e2e/tests/dev-panel-class-simulation.spec.ts` |

## Claims verification

### Demo feedback / class simulation E2E

After reopening the flyout, the spec **re-queries** `simSheet`, waits until **“Loading your classes…”** is gone, **re-selects** the class, then asserts **Clear simulated data** is enabled. This fixes stale dialog locators and racey enablement without changing app behavior—appropriate synchronization, not assertion weakening.

### Layout E2E (`runControlled`)

- Introduces `runControlled` so **viewport resize + `page.goto`** share the same “controlled navigation” window as `gotoAndSettle`.
- Extends ignorable console errors to **manifest patch abort** (existing) plus **Suspense hydration race** messages, **only while** `inControlledNavigation` is true.
- **`pageerror` handlers are unchanged**—real uncaught exceptions still fail tests outside/inside controlled blocks.
- Unit tests cover `isIgnorableControlledNavigationConsoleMessage` positive/negative cases.

**Assessment:** Flake fixes are **sound**. Ignoring hydration console noise during deliberate resize/re-nav is scoped to test harness timing; it does not suppress errors after `assertNoErrors()`.

### Log redaction (`buildSafeErrorForLog`)

All claimed catch paths route through the shared helper (same module as prior quality-sweep PRs):

| Log key / site | Status |
|----------------|--------|
| `ai_usage_log_failed` (ALLOWED + DENIED) | ✓ `{ error: buildSafeErrorForLog(err) }` (replaces raw `err` object) |
| `free_tier_scan_record_failed` | ✓ |
| `internal_platform_api_audit_failed` | ✓ |
| `internal_rubric_release_flag_failed` | ✓ |
| `video_duration_extract_failed` | ✓ (structured key; message redacted) |
| `entry.server.tsx` file-logging catch | ✓ |

No secrets or raw emails in the diff. Minor observability-only deltas: `ai_usage_log_failed` field **`err` → `error`**; video failure log uses structured key instead of freeform prefix.

### Dependencies / other PRs

`git diff main...HEAD` includes **no** dependency manifests. No edits outside the listed hygiene/redaction files.

## Local verification (reviewed SHA checked out)

```text
/home/ubuntu/.bun/bin/bun test \
  app/utils/ai-usage-log.server.test.ts \
  e2e/test-helpers.manifest-console.test.ts
```

**11 pass, 0 fail** (includes new redaction test for `ai_usage_log_failed`).

Full-repo `./bin/project test --profile changed` was **not** used as a gate (environment reported many unrelated failures). `bun run typecheck` in `services/web-app` **OOM’d** locally; rely on CI **ʦ TypeScript** for compile proof.

## CI at review time

GitHub Actions for PR #748 was **still running** (E2E shards, demo feedback, TypeScript, etc. pending). **Changed paths** and **migration-integration** were green. Merge should wait for full PR checks green; this review does **not** block on pending jobs alone given code/test evidence above.

## Risks (non-blocking)

1. **Suspense hydration filter** — If production hydration regressed *only* as a console `error` (not `pageerror`) during normal (non-test) navigation, this PR would not affect production; only layout E2E ignores it during controlled resize/goto.
2. **Log field rename** `err` → `error` on `ai_usage_log_failed` — downstream log queries must use `error` if they keyed off `err`.

## Verdict rationale

Tight scope, completes leftover server log redaction with a targeted unit test, and hardens known CI flakes without product UI changes or dependency churn. **Recommend merge after PR CI is fully green.**
