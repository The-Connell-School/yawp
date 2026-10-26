# Independent Ship Review — PR #779 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/779 |
| Title | Quality sweep #8l: deferred script safe-error logging (#744 chain) |
| Branch | `cursor/quality-sweep-8l-safe-script-logs-59dc` |
| Base | `main` @ `c1eefcae2ae068f1ca386a1b2ed2dce397581fb9` |
| Reviewed head | `f376d9d18f77ae255e84b6a70e98c3390fe45868` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-26 |

## Verdict

**SHIP** on head `f376d9d18f77ae255e84b6a70e98c3390fe45868`.

## Freshness

GitHub `headRefOid` for PR #779 matches the expected review SHA `f376d9d18f77ae255e84b6a70e98c3390fe45868`. Merge-base with `origin/main` is `c1eefcae2ae068f1ca386a1b2ed2dce397581fb9` (0 commits behind `main`, 1 commit on the PR branch). No freshness block.

## Scope (11 files — call-site logging only)

Single commit `f376d9d18`: replaces raw `console.error(err|e|error)` (or raw `err` in smoke step logs) with `logScriptError` / `buildSafeErrorForLog` at deferred #776 sites. **No** edits to `log-script-error.server.ts`, `server-error-request-context.server.ts`, app routes, UI, Terraform, or feature flags.

### Claimed files vs diff

PR file list matches `git diff main...f376d9d18` exactly (11 files, +31/−15):

| Area | Files |
| --- | --- |
| Prisma CLI (7) | `archive-non-canonical-submissions.ts`, `assignments-unification-postcheck.ts`, `assignments-unification-preflight.ts`, `compare-grade-submission-parity.ts`, `document-hardening-dry-run.ts`, `seed-overlay.ts`, `verify-post-consolidate-migration.ts` |
| QA / CI / web-app scripts (4) | `qa/capture-handle-password-preview.mjs`, `scripts/ci/install-playwright-chromium.sh`, `generate-flag-off-email-goldens.mts`, `smoke-pr-preview.mjs` |

### Deferred items (correctly out of scope)

PR body deferred paths are **unchanged** on this head:

- `scripts/preview/wake-server.mjs` — still logs raw `error` as second arg (e.g. `Preview wake failed`).
- `packages/prisma/scripts/migrate-remote.ts`, `production-qa-profile-remote.ts`, `preview-seats.ts`, `sqlite-to-psql/migrate.ts` — still `console.error('…', error)` two-arg forms.
- Other preview `.mjs` helpers — not touched in this diff.

No scope creep into SSH/migration second-arg standardization or preview infra refactors.

## Import regression check (#776 r1)

r1 on #776 **BLOCK** was nested `import { logScriptError …` **inside** another `import { … }` block (invalid TS).

On PR #779 head:

- All seven Prisma `.ts` scripts use **standalone** top-level `import { logScriptError } from '…/log-script-error.server'`.
- `archive-non-canonical-submissions.ts` keeps grouped `./archive-non-canonical-submissions.helpers` import; `logScriptError` is on the **following** line (not nested).
- `qa/capture-handle-password-preview.mjs`, `generate-flag-off-email-goldens.mts`, and `smoke-pr-preview.mjs` use separate top-level imports after their existing import blocks.
- `scripts/ci/install-playwright-chromium.sh`: inline verify snippet uses two consecutive ESM import lines (`playwright`, then `logScriptError`) — not nested inside another import statement.

Repo scan on reviewed tree: no `import {\nimport { logScriptError` pattern.

## Behavior / control flow

- **Exit codes**: Every swapped `main().catch` / `.catch` still calls `process.exit(1)` where it did before; `install-playwright-chromium.sh` verify snippet still `process.exit(1)` on launch failure; shell function return paths (0 / 1 / 2) unchanged aside from runtime (`node -e` → `bun -e` in repo root) to allow ESM `logScriptError` import — aligned with PR description and repo Bun usage.
- **`smoke-pr-preview.mjs` `fail()`**: Step summary uses redacted `buildSafeErrorForLog` message/name; `console.error` logs structured safe object instead of raw `err`. Smoke JSON output shape preserved (`steps[].err` string summary); no app/UI surface change.
- **Secrets**: Call sites route through existing `buildSafeErrorForLog` / `logScriptError` helpers from #776; no new raw exception dumps introduced.

## Verification

Local (detached @ `f376d9d18`):

```text
~/.bun/bin/bun test app/utils/server-error-request-context.server.test.ts
# 11 pass, 0 fail

NODE_OPTIONS='--max-old-space-size=8192' ~/.bun/bin/bun run typecheck  # services/web-app
# react-router typegen && tsc — exit 0
```

GitHub Actions for PR #779 (workflow run `40253449500`, triggered on `f376d9d18`) at review time:

| Check | Status at review time |
| --- | --- |
| Changed paths | pass |
| Preview tooling | pass |
| migration-integration | pass |
| ʦ TypeScript | in progress (local `tsc` clean on same tree) |
| Prisma migrations | in progress |
| E2E / browser shards | in progress |

No compile/syntax issues identified in the diff; remaining CI was still running when this review was written.

## Blockers

None.

## Recommendation

Merge PR #779 when required CI checks (at minimum **ʦ TypeScript**) are green on `f376d9d18f77ae255e84b6a70e98c3390fe45868`. This review did not modify application code on the feature branch.
