# Independent Ship Review r2 — PR #923

**PR:** https://github.com/The-Connell-School/yawp/pull/923  
**Title:** Sync assignment-type artwork (demo / prod-fidelity fixtures)  
**Branch:** `cursor/assignment-type-artwork-sync-b59e`  
**Base:** `main`  
**Reviewed product/code SHA:** `4dd3acb82f37f21123880fef534ad14a2d08ed3c`  
**Merge head SHA (exact-head CI gate):** `4dd3acb82f37f21123880fef534ad14a2d08ed3c`  

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-07  

**Prior review:** `state/SHIP_REVIEW_assignment-type-artwork-sync_r1.md` @ `fdd447c4` — **SHIP (superseded)**. r1 approved rewriting applied migration `20261008001100`; that approach is **invalid** for databases that already applied the bootstrap. **This r2 review replaces r1** and does not inherit its verdict.

**SHIP**

---

## Checklist (r2 scope)

| # | Gate | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `20261008001100_bootstrap_exit_ticket_assignment_type/migration.sql` unchanged vs `main` (byte-identical to applied history) | **Met** | `git diff origin/main...4dd3acb8` — 0 lines on that path; `cmp` against `origin/main` blob |
| 2 | Forward migration `20261107120000_update_exit_ticket_assignment_type_image` exists | **Met** | New folder under `packages/prisma/migrations/` |
| 3 | Forward migration uses `UPDATE` (not `INSERT`) on existing Exit Ticket `AssignmentTypeImage` rows | **Met** | `UPDATE "AssignmentTypeImage"`; no `INSERT INTO "AssignmentTypeImage"`; tests assert |
| 4 | Forward migration idempotent (`md5` guard) | **Met** | `AND md5(img."blob") IS DISTINCT FROM '80baf4f9c4276a9d896028c021dcc592'` |
| 5 | Embedded fixture bytes match prod-fidelity Exit Ticket md5 `80baf4f9c4276a9d896028c021dcc592` | **Met** | `exit-ticket-migration-image.test.ts`; fixture row `cexitticketimage000000000` |
| 6 | Bootstrap migration still carries originally applied artwork md5 `12e8c7775d7c5ad1ebd01cdffe70f949` only | **Met** | Test `bootstrap migration still embeds the originally applied artwork only` |
| 7 | Daily Pages / Thesis / Pre-writing / prod-fidelity JSON coherent and safe | **Met** | See table below |
| 8 | Exact-head CI green (single check; no poll) | **Met** | Run `42341646891` — 19 success, 6 skipped, 0 failed |

---

## Exact-head CI (required gate)

| Check | Result |
| --- | --- |
| CI (Changed paths, Prisma migrations, Migration Integration, ʦ TypeScript, E2E smoke shards, browser jobs, merge reports) | **pass** on `42341646891` |
| Factory L0 smoke | **skipped** (expected — product PR touches `packages/prisma/migrations/`) |
| PR preview | **pass** (`preview-policy`, `preview-deploy`) |

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| Daily Pages prod-fidelity tile (Brian 11/5) | Row `cmlikzgcf000d0ql226d1hxji` md5 `de6553790d16191d326bbde20b893ced` on head (was `4f804b9d…` on `main`) | **Met** |
| Thesis Statement tile | Row `cmm2dtl9q01yp0qjq08ssdr00` md5 `d0d12c18db5bed8eefa47bb550de2ff9` matches `packages/prisma/scripts/assets/thesis-statement.jpg` | **Met** |
| Pre-writing bundle tile (seed script assets, not prod-fidelity JSON) | `prewriting.jpg` md5 `f903a3e91b54fc985e511c39a5e3c137`; smaller JPEG only under `scripts/assets/` | **Met** |
| Exit Ticket artwork on **new** seeds / imports | Fixture + forward migration md5 `80baf4f9…` | **Met** |
| Exit Ticket artwork on **already-bootstrapped** DBs | Forward `UPDATE` keyed on `kind = exit_ticket`, image id `cexitticketimage000000000`, md5 guard | **Met** |
| No unintended runtime / flag / web-app logic | Diff vs `main`: 5 files — fixtures JSON, forward migration SQL, 2 JPEG assets, test file | **Met** |

---

## Scope vs `main`

**5 files**, +169 / −23 (line counts; SQL/JPEG payloads dominate).

---

## Tests (reviewer-executed @ `4dd3acb8`)

```text
/home/ubuntu/.bun/bin/bun test packages/prisma/scripts/exit-ticket-migration-image.test.ts packages/prisma/scripts/exit-ticket-fixture.test.ts
→ 10 pass, 0 fail
```

---

## Risk notes (non-blocking)

- **No `rollback.sql` on `20261107120000`:** Data-only idempotent artwork refresh; reverting merge does not auto-restore prior blob bytes (acceptable for cosmetic asset sync).
- **`docs/ship-review/pr-374.md`:** Unchanged on this head; bootstrap md5 note there remains accurate; forward migration is not yet documented in that runbook (follow-up optional).

---

## Merge recommendation

**Approve merge to `main`.** r1’s unsafe bootstrap rewrite is gone; existing Exit Ticket image rows update via forward migration; bootstrap bytes match applied history; CI green on reviewed head; checksum tests pass.
