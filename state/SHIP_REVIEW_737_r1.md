# Independent Ship Review — PR #737 (r1)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/737 |
| **Branch under review** | `cursor/quality-sweep-org-classes-1def` (read-only; not modified by this review) |
| **Reviewed head SHA** | `ece889bed0f391359be4e9927d1ea8bc31911587` |
| **Base** | `main` (diff: `origin/main...ece889bed0f391359be4e9927d1ea8bc31911587`) |
| **Head drift check** | GitHub `headRefOid` matched required SHA at review time |
| **Verdict** | **SHIP** |

## Summary

PR #737 is a focused quality-sweep (#8) change: six files, ~146 insertions, no unrelated product surface. Claims in the PR body match the diff.

### Claim verification

1. **Org classes `take` clamp / persist via parse on cookie write**
   - `ORGANIZATION_CLASSES_TABLE_TAKE_OPTIONS` (`10`, `20`, `50`, `100`) and `normalizeOrganizationClassesTableTake` added in `cookies.server.ts`.
   - `parseOrganizationClassesTableCookie` uses normalization (invalid / forged `take` → default `10`).
   - `setOrganizationClassesTableCookie` merges then re-runs `parseOrganizationClassesTableCookie` on every write (covers sort, skip/take pagination, and other filter updates).
   - Unit test: forged `take: 999` → `10`; `take: 50` preserved.

2. **Seat cap alignment — `_count.students` excludes simulated students**
   - Loader `_count.students` now filters `isActive: true`, `role: 'STUDENT'`, `user: { simulatedForClassId: null }`.
   - Matches `countFreeClassSeatUsage` in `class-seat-cap.server.ts` (same simulated-user exclusion for active student memberships). Teachers count unchanged (intentional).

3. **Pending-owner Code sort header**
   - New `organizationClassListTableState` delegates sort remapping to existing `organizationClassListQueryParts` (`code` → `createdAt` when `hideTeachingSecrets`).
   - Loader returns `table` via that helper (`sort`, `codeSortDisabled`, etc.).
   - UI: Code header non-interactive when `codeSortDisabled`; no sort chevrons when disabled.
   - Action: on `updateFilters` / `sort`, persists `createdAt` instead of `code` when secrets hidden.
   - Integration test expectations updated for `table.sort` / `codeSortDisabled` (not re-run in this session; see tests below).

### Scope / risk scan

| Check | Result |
| --- | --- |
| Scope creep | None — all changes tied to org classes table cookies, loader counts, locked-preview table state, and tests |
| Secrets / credentials | None |
| `reset_data` | Not touched |
| Feature flags / prod rollout | None |
| Kevin / TeacherKev (#723, #484, #459, #437) | Not touched |
| User-facing copy / brand | No new strings; no "AI" added; no product-name regressions observed in diff |
| Backward compatibility | Non-allowlisted `take` values that previously could persist now snap to `10` on read/write — aligns with UI page sizes and reduces abuse surface |

### Minor notes (non-blocking)

- `app/routes/app.organization.classes/route.test.ts` exercises class actions only; new behavior is covered by `locked-preview.server.test.ts`, cookie tests, and (in CI) DB integration tests.
- `organizationClassListTableState` reuses query-parts logic with `q: null` — appropriate because sort remapping does not depend on search text.

## Test results

Environment: detached checkout at reviewed head; Bun `/home/ubuntu/.bun/bin/bun`.

```text
cd services/web-app && bun test \
  app/domain/free-tier/locked-preview.server.test.ts \
  app/utils/cookies.organization-classes-table.test.ts \
  app/routes/app.organization.classes/route.test.ts
```

| Result | Detail |
| --- | --- |
| **Pass** | **33** tests, **0** failures, **78** expect() calls (~603 ms) |

Not run in this cloud session (per PR body): `teaching-secrets-loader.integration.test.ts` under `LOCKED_PREVIEW_DB_TESTS=1`; `bunx tsc --noEmit`.

## Reviewer

Independent ship review r1 (Cursor Cloud Agent). Docs-only follow-up PR adds this file only; does not modify `cursor/quality-sweep-org-classes-1def`.
