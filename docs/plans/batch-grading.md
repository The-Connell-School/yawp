# Batch Grading with AI Assistant

## Summary

Teachers can trigger AI grading for all ungraded submitted essays on a given assignment in one action. The AI grades each essay individually and saves results as drafts. The teacher then reviews and releases grades when ready.

---

## Decisions Made

### Grading approach
- **Individual AI grading per essay** — each paper gets its own tailored rubric scores, grammar check, and overall comment. Not "same grade applied to all."

### What gets graded
- Only submissions that are: **submitted** (`submittedAt` is set) AND **ungraded** (`gradedAt` is null)
- Already-graded essays are skipped entirely

### Where it triggers
- From an **assignment-level view** — teacher sees something like "23 submissions for Macbeth Essay" and clicks "Grade All"
- **v1 scope: by class** — initial version will grade all ungraded submissions for a given assignment within a single class; cross-class batch grading is out of scope for now
- Exact placement TBD pending work on the simplified teacher dashboard

### Processing model
- **Background processing** — job runs asynchronously, teacher doesn't have to wait
- As each essay is graded it moves from "Submitted" to "Graded" — no separate notification needed; the teacher just sees the Graded tab fill up

### On partial failure
- If individual essays fail to grade, they stay in **submitted/ungraded** state
- Teacher can retry failed ones manually or via another "grade all" run (which skips already-graded essays)
- No partial states — an essay is either fully graded or untouched

### Post-grading flow
- Grades land in the existing **Graded** tab — this is the review surface
- Teacher can edit any AI-generated grade freely (scores, comments, rubric) before releasing
- Batch release works exactly as it does today — teacher selects essays and releases in bulk

---

## Open Questions

- [ ] **Assignment-level view** — does this live on the existing class page (filtered by assignment) or a new dedicated assignment page? Depends on simplified dashboard work.
- [ ] **Concurrency limits** — how many parallel AI calls per batch job? Need to balance speed vs. rate limits and cost.
- [ ] **Job persistence** — if the server restarts mid-job, do we resume or restart? Probably acceptable to just show failed essays as ungraded in v1.

### Settled
- **Job status** — no notification needed; essays appear in Graded tab as they complete
- **Teacher review** — full edit access to AI grades before release; no approve/reject gating
- **Batch release** — uses existing release flow as-is
- **Re-grade** — not in v1; "Grade All" only touches ungraded essays

---

## Technical Notes (preliminary)

### Existing patterns to build on
- `/api/domain/grade-essay-ai` — single-essay AI grading; batch version would call this logic in a loop
- `/api/domain/release-grades` — only existing batch operation; good auth/scoping pattern to follow
- `release-grades` uses `prisma.submission.updateMany()` — batch DB writes already proven
- Auth: `buildTeacherClassWhere()` scopes submissions to teacher's own classes; admins bypass

### New pieces needed
1. **Batch grading API route** — accepts `assignmentId` (and implicit `classId`/auth), enqueues or runs background job
2. **Job runner** — iterates ungraded submissions, calls AI grading logic for each, writes results
3. **Job status mechanism** — some way for the UI to poll or be notified of completion
4. **UI trigger** — "Grade All" button on assignment view, with progress feedback
5. **Review flow** — teacher can browse AI-graded essays before releasing (may already be mostly covered by existing "Graded" tab)

### Key constraint
- AI grading currently hardcoded to single essay in `grade-essay-ai` route — will need to extract the core grading logic into a reusable function for the batch runner to call per essay
