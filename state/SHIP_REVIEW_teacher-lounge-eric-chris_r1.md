# Independent Ship Review r1 — Teacher Lounge Eric + Chris allowlist

**PR:** https://github.com/The-Connell-School/yawp/pull/904  
**Title:** fix(teacher-lounge): allowlist Eric Miller and Chris Davis  
**Branch:** `cursor/teacher-lounge-eric-chris-allowlist-eb8f`  
**Reviewed head SHA:** `95ed10dbf8c6045a8f0e827dd347775907970d37`  
**Reviewer:** Cloud Agent (independent self-review; same pattern as PR #898)  
**Date:** 2026-11-02  

**SHIP** (pending exact-head CI green on `95ed10dbf`)

---

## Scope vs author claims

**2 files**, +24 / −0 — email-only hotfix on top of #898 Simmons allowlist.

| Area | Behavior |
| --- | --- |
| Global flag | `TEACHER_LOUNGE_TEMPORARILY_DISABLED = true` unchanged |
| Allowlist | Adds `eric@theconnellschool.com`, `christhewriter@mail.com` alongside Simmons |
| Helper | Unchanged — case-insensitive via `normalizeEmail` |
| Nav / routes | Unchanged — existing helper wiring from #898 |
| Unit tests | New case-insensitive tests for Eric and Chris; `[0]` Simmons test preserved |

No migrations. No `teacher_lounge_community` / forum (#897). No feature-flag flips.

---

## Product / rollback

1. **Default:** All teachers remain soft-disabled (#884).
2. **Exception:** Simmons, Eric Miller, and Chris Davis keep sidebar + `/app/teacher-trainings*` access.
3. **Risk:** Hard-coded emails only; alternate login addresses would not match.
4. **Rollback:** Revert PR or remove emails from allowlist.

---

## Auth / security review

- No change to auth order or membership checks from #898.
- Allowlist does not bypass TEACHER role or org membership.

---

## Tests (reviewer-executed @ `95ed10dbf`)

```text
bun test app/domain/teacher-lounge/teacher-lounge-temporary-disable*.test.ts app/routes/app/sidebar-nav.teacher-lounge.test.ts
→ 9 pass, 0 fail
```

---

## CI gate

Merge only after GitHub Actions **success** on head `95ed10dbf`.
