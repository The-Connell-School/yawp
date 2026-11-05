# Independent Ship Review r1 — PR #898

**PR:** https://github.com/The-Connell-School/yawp/pull/898  
**Title:** fix(teacher-lounge): allowlist Simmons while global disable stays on  
**Branch:** `cursor/teacher-lounge-simmons-allowlist-7255`  
**Reviewed head SHA:** `ede5751fd14f5426fa5cf4b18a8ae356bd4dec06`  
**Reviewer:** Cloud Agent (self-review; no `.cursor/skills` Ship Review skill in repo)  
**Date:** 2026-11-02  

**SHIP** (pending exact-head CI green on `ede5751fd`)

---

## Scope vs author claims

**10 files**, +131 / −17 — narrow hotfix on top of #884 global disable.

| Area | Behavior |
| --- | --- |
| Global flag | `TEACHER_LOUNGE_TEMPORARILY_DISABLED = true` unchanged |
| Allowlist | `TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS = ['zestlan.simmons@mps.k12.al.us']` |
| Helper | `isTeacherLoungeTemporarilyDisabledForUser({ email })` — case-insensitive via `normalizeEmail` |
| Nav | `teacherLoungeNavVisible` uses helper with `user.email` |
| Routes | Teacher-trainings loaders + module **action** auth first, then email lookup + redirect guard |
| Legacy alias | `/app/teacher-courses` respects helper (allowlisted → `/app/teacher-trainings`) |
| Unit tests | Helper, redirect, sidebar visibility |

No migrations. No `teacher_lounge_community` / forum (#484). No overlap with Brian batch #897.

---

## Product / rollback

1. **Default:** All teachers remain soft-disabled (#884 behavior).
2. **Exception:** Dr. Zestlan Simmons (`zestlan.simmons@mps.k12.al.us`) regains sidebar link and `/app/teacher-trainings*` access.
3. **Risk:** Hard-coded email only; alternate login email would not match. Org-wide allowlist deliberately omitted.
4. **Rollback:** Revert PR or remove email from allowlist; no data migration.
5. **E2E:** `teacherLoungeE2eSkipped` still keys off global boolean — Lounge E2E remains skipped while flag true (acceptable; Simmons exception is prod-only UX).

---

## Auth / security review

- Redirect guard runs **after** `requireUserId` on training routes (order fix vs #884 pre-auth redirect). Unauthenticated users still hit login flow before lounge content.
- Allowlist does not bypass `requireMembership` or TEACHER role checks.
- No new public surface; no admin bypass.

---

## Tests (reviewer-executed @ `ede5751fd`)

```text
bun test app/domain/teacher-lounge/ app/routes/app/sidebar-nav.teacher-lounge.test.ts
→ 7 pass, 0 fail
```

---

## CI gate

Merge only after GitHub Actions **success** on head `ede5751fd14f5426fa5cf4b18a8ae356bd4dec06` (CI + migration-integration).
