# Independent Ship Review r1 — PR #901

**PR:** https://github.com/The-Connell-School/yawp/pull/901  
**Title:** Student class assignments: new pill and group by type  
**Branch:** `cursor/student-assignment-new-pill-51ef`  
**Base:** `main`  
**Reviewed head SHA:** `c45a355320a0a3467e4b739373e748cc54853fb7`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-11-02  

**SHIP**

---

## Product intent vs implementation @ `c45a35532`

| Intent | Evidence | Result |
| --- | --- | --- |
| Green **New** pill on unseen class assignments; clears after first open | `ClassAssignmentStudentFirstOpen` + `recordClassAssignmentFirstOpen` on both Start routes; `Badge variant="success"` on `StudentAssignmentCard`; loader marks `isNew` from first-open rows + existing class documents | **Met** |
| Default organize by assignment type | `groupStudentClassAssignmentsByType` + section headers in `StudentClassDetailView` | **Met** |
| Subtle type accent without speculative tokens | Reuses `AssignmentTypeTileImage` when catalog image exists; otherwise unchanged gradient + prompt | **Met** |
| Match existing student UI; no flashy redesign | Same card/grid; white/muted surfaces preserved | **Met** |
| Tests for first-open persistence | Unit + persistence + loader + start route; E2E `student.class-detail.spec.ts` | **Met** |
| Student class dashboard only; no locked preview / Teachers Lounge | Diff scoped to student class detail + shared Start persistence | **Met** |

---

## Exact-head CI

**Workflow:** https://github.com/The-Connell-School/yawp/actions/runs/41525018788  
**Run `headSha`:** `c45a355320a0a3467e4b739373e748cc54853fb7` — **matches reviewed head**  
**Status:** **success** (TypeScript, Prisma migrations, migration-integration, E2E smoke shards, locked preview browser, sign-on)

---

## Verdict

**SHIP** — merge approved on green CI @ `c45a35532`.
