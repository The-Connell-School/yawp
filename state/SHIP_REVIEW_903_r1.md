# Independent Ship Review r1 — PR #903

**PR:** https://github.com/The-Connell-School/yawp/pull/903  
**Title:** fix: LP per-org flag, View rubric, and GA comment readability (Brian unblock)  
**Branch:** `cursor/brian-unblock-pr-a-0120`  
**Reviewed head SHA:** `bcd45b150e156604a15c649b5fcf30e5ef9ea404`  
**Reviewer:** Cloud Agent (self-review; no `.cursor/skills` Ship Review skill in repo)  
**Date:** 2026-11-02  

**SHIP** (pending exact-head CI green on `bcd45b150`)

---

## Scope vs author claims

**9 files**, +248 / −11 — PR A extract from draft #897 only.

| Area | Behavior |
| --- | --- |
| Lesson Planner | `isLessonPlannerEnabled` reads `lesson_planner` flag only; no `free_tier` prerequisite |
| Grading | Loader builds `gradingRubricSummary`; panel shows **View rubric** dialog |
| GA readability | Larger/contrast text for grammar issue message + rule; assistant issue messages |
| CI | `pr_run_heavy_jobs` output; E2E jobs unchanged for non-draft PRs |

No migrations. No Lounge forum / `teacher_lounge_community`. No `package.json` / `app.css` edits.

---

## Product / rollback

1. **Brian:** Internal Flags `lesson_planner` targeted org IDs show LP nav on contract schools without `free_tier`.
2. **Interns:** Week 3 retest for View rubric + readable GA text after deploy.
3. **Rollback:** Revert PR; LP re-couples to free tier; UI reverts to prior typography.

---

## Tests (reviewer-executed @ `bcd45b150`)

```text
bun test feature-flags.server.test.ts grading-rubric-summary.test.ts teacher-grading-panel.test.tsx
→ 46 pass, 0 fail
```

---

## CI gate

Merge only after GitHub Actions **success** on head `bcd45b150e156604a15c649b5fcf30e5ef9ea404`.
