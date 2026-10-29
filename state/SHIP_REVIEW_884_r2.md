# Independent Ship Review r2 — PR #884

**PR:** https://github.com/The-Connell-School/yawp/pull/884  
**Title:** Hotfix: temporarily hide Teacher's Lounge from app nav  
**Branch:** `cursor/temp-disable-teachers-lounge-320e`  
**Base:** `main` @ `821cd1a0623178390c21b11e53ee0b467141c668` (#883 merged)  
**Reviewed head SHA:** `5f426d5e3edb8cc43fe964c09c83b5040ddab777` (`5f426d5e3`)  
**GitHub `headRefOid` at review time:** `5f426d5e3edb8cc43fe964c09c83b5040ddab777` — **matches; freshness OK**

**Prior review:** r1 @ `437a4ef042868b08b1095169295a51da05b5be1b` — **NO-SHIP** (E2E sidebar nav count 9→8; dev-panel artboard `goto` interrupted by post-jump navigation)

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-29  

SHIP

---

## r2 delta vs r1 (author fixes after `437a4ef04`)

| r1 blocker | r2 evidence @ `5f426d5e3` | Result |
| --- | --- | --- |
| Sidebar E2E expected 9 links with Lounge hidden | `teacher.sidebar-settings-short-viewport.spec.ts`: `toHaveCount(8)` + zero `a[href="/app/teacher-trainings"]` | **Addressed** |
| Lounge-only E2E still exercised while flag on | Shared `teacher-lounge-disabled.ts`; `test.skip` / filtered loops in Lounge axe, media a11y, guided-tour, ua-manual evidence | **Addressed** |
| Dev-panel artboard flaky `goto` after free-tier jump | `dev-panel-artboard-evidence.spec.ts`: `waitForURL` accepts `/app` **or** `/app/` before next navigation | **Addressed** (`5f426d5e3`) |

Commits on branch after r1 head: `db05c596b` (E2E + dev-panel nav wait), `5f426d5e3` (pathname `/app/` tolerance).

---

## Exact-head CI (required gate)

**Workflow:** https://github.com/The-Connell-School/yawp/actions/runs/40898449745  
**Run `headSha`:** `5f426d5e3edb8cc43fe964c09c83b5040ddab777`  
**Run conclusion:** `success`

Check runs on reviewed head (GitHub API):

| Conclusion | Count |
| --- | ---: |
| success | 18 |
| skipped | 2 (`preview-destroy`, `preview-cleanup`) |
| failure | 0 |

All required jobs pass on exact head, including E2E smoke shards 1–6, demo feedback + preview access browser checks, sign-on browser flows, TypeScript, Prisma migrations, and migration-integration.

---

## Scope vs author claims (`origin/main...5f426d5e3`)

**17 files**, +156 / −39 — matches PR summary (no #883 admin org work in this delta; #883 is already on `main`).

| Area | Files / behavior |
| --- | --- |
| Hotfix flag | `teacher-lounge-temporary-disable.ts` (`TEACHER_LOUNGE_TEMPORARILY_DISABLED = true`) |
| Route guards | `redirectIfTeacherLoungeTemporarilyDisabled()` in teacher-trainings index, detail, module loader **and** action |
| Nav | `teacherLoungeNavVisible` gates sidebar link via `FLAT_SIDEBAR_SECTIONS` |
| Legacy alias | `/app/teacher-courses` → `/app` while disabled |
| Unit tests | Redirect helper, sidebar destinations, legacy route |
| E2E | Sidebar count/link assertions, Lounge spec skips, guided-tour path filter, dev-panel jump stabilization |

No migrations, no admin Lounge tooling changes in this diff.

---

## Product / rollback (code review)

1. **Teacher experience:** Lounge link hidden; direct `/app/teacher-trainings*` and legacy `/app/teacher-courses` redirect to `/app`. Intended soft-disable; underlying data and admin surfaces unchanged.
2. **Re-enable:** PR documents flipping `TEACHER_LOUNGE_TEMPORARILY_DISABLED` to `false` and removing the guard when ready. E2E skip helper reads the same const, so tests re-engage automatically on re-enable.
3. **No weakened auth:** Redirect runs after normal loader entry points; no bypass of membership checks on routes that remain reachable.

---

## Tests (reviewer-executed @ `5f426d5e3`)

```text
bun test app/domain/teacher-lounge/teacher-lounge-temporary-disable.server.test.ts
     app/routes/app/sidebar-nav.teacher-lounge.test.ts
     app/routes/app.teacher-courses._index/route.test.ts
→ 3 pass, 0 fail
```

---

## Residual risk (non-blocking)

- Re-enable requires a **deploy** (const hotfix, not a DB feature flag). Acceptable for stated emergency hide; documented in PR body.
- Bookmarks to Lounge URLs land on the teacher dashboard while disabled (expected).

---

## Verdict

**SHIP** — r1 E2E blockers are fixed; scope matches the hotfix; exact-head CI is green (18 success, 2 skipped). Safe to merge from an independent review perspective. **Do not merge as part of this review task.**
