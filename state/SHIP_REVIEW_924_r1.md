# Independent Ship Review r1 — PR #924

**PR:** https://github.com/The-Connell-School/yawp/pull/924  
**Title:** fix(web): improve Grading Assistant rubric and grade text contrast  
**Branch:** `cursor/grading-assistant-contrast-4b3e` (inferred from agent metadata)  
**Base:** `main`  
**Reviewed product/code SHA:** `e19401365df47c1738ba846725bc1d6383965cac` (`e1940136`)  

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-07  

**SHIP**

---

## Request vs diff

Brian (Intern Week 3) asked to darken gray Grading Assistant reasoning and saved-grade text for readability. The change should stay visual-only.

| Check | Result |
| --- | --- |
| Only contrast / presentation (no logic, data, API, migrations) | **Pass** — 8 files, all `services/web-app` TSX + 2 unit tests |
| GA rubric feedback, band descriptions, helper copy, released/saved grade surfaces | **Pass** — `ViewPanel`, submission + document `TeacherGradingPanel`, `GradeDetailsSheet`, `GradingRubricSummaryCard`, `GradeSummaryReleasedLabel` |
| Shared design tokens (no one-off hex) | **Pass** — `text-foreground/90`, `/80`, `/70` via Tailwind on `--foreground` |
| Unrelated churn | **None observed** |

---

## Skeptical notes (non-blocking)

1. **Slightly broader than “color only.”** In `view-panel.tsx` and legacy `app_.documents_.$id` grammar issue lines, `text-xs` becomes `text-sm leading-snug` in addition to token swaps. Still visual-only; matches the submissions grading panel grammar line (`text-sm leading-snug text-foreground/90` at ~1477). Reasonable for readability; not a logic risk.
2. **Hierarchy preserved.** Released footer and badge icon use `/80`; empty “No feedback” uses `/70` italic instead of `muted-foreground` — de-emphasized but darker than before. Dark mode inherits `.dark { --foreground: … }` so opacity modifiers track theme (no hard-coded light-theme gray).
3. **Tests** assert class tokens on `ViewPanel` and `GradeSummaryReleasedLabel`; they do not prove WCAG ratios — acceptable for a token alignment fix with green CI.

---

## CI (single check on reviewed SHA)

Recorded once on `e1940136`: TypeScript, Prisma migrations, migration integration, Playwright E2E + smoke shards, sign-on and preview browser checks — **all pass** (run associated with PR #924).

---

## Merge recommendation

**Approve merge to `main`.** Low-risk UI token alignment; no deploy migration gate beyond normal release.
