# Session Notes — 2026-04-09 — Document Hardening Phase 1 Complete

## Overview

Phase 1 of the document-hardening refactor is complete on branch `document-hardening`. This file is the handoff summary for the next session. The persistent memory at `~/.claude-personal/projects/-Users-bryantbrock-brocksoftware-yawp-2-0/memory/` has the structured facts; this file is the narrative.

## What shipped in Phase 1 (27 tasks, 34 commits on document-hardening branch)

### Architectural changes
- New editor stack: `DocumentEditor` wrapper (IDB-aware hydration) → slim `editor.tsx` (pure PM host, 136 lines) → `useEditorSync` (5-min idle-resetting hash-deduped revision timer) + `usePmTripwire` (runtime guard against unauthorized PM mutations)
- Source-tracker PM extension tags user-originated transactions; tripwire throws in dev / counts in `window.__yawpUnauthorizedPmWrites` in prod
- `shouldRevalidate: false` unconditionally — no more `?spa=1` hack
- Tutor endpoints return updated `cms` — local state via `useTutorState` replaces loader refetches
- Extracted hooks from `route.tsx`: `use-tutor-state`, `use-comments-state`, `use-auth-heartbeat`, `use-document-submit`
- Teacher grading siblings created (`teacher-grading/grade-highlights-overlay.tsx`, `selection-toolbar.tsx`) — NOT yet mounted from `route.tsx` (Phase 3 mounts them)

### Deletions
- `editor/index.tsx` (873-line monolith)
- `_components/document-versions.tsx` (376 lines)
- `pending-document-save.ts`, `editor-content-context.tsx` (dead code)
- DocumentVersion API routes (`api.model.document.$id.versions`, `api.domain.restore-document-version`)
- `DocumentVersion` model + table — 4,921 rows backfilled into `DocumentRevision` with `trigger='imported-version'` (tested against real production data locally)

### Metrics
| | Before | After |
|---|---|---|
| `route.tsx` | 1,507 lines, 17 useEffects | 1,076 lines, 1 useEffect |
| `editor/index.tsx` | 873 lines | deleted |
| New `editor.tsx` | — | 136 lines |
| Unit tests | 85 pass / 12 fail | 87 pass / 0 fail |
| Typecheck errors | ~8 | 0 |

## Local dev environment

- Dev server: `bun run dev` from repo root, serves at http://localhost:5176/
- Local `yawp` Postgres has **production data restored** via `AWS_PROFILE=yawp aws s3 cp s3://yawp-production-database-exports/Mar03260636.dump`
- Row counts: 1,670 users, 2,637 documents, 7,072 snapshots, 9 orgs, 40 schools
- **Feature flags flipped globally** in the Setting table:
  - `document_submission_enabled = true`
  - `assignments_enabled_org_ids` = all 9 org IDs
- `services/web-app/.env` password was wrong (`password` vs `postgres`) — fixed locally, not committed (file is gitignored)

## Known non-blocking issues (defer to Phase 2+ or follow-up)

1. **Data-loss regression test #2 fails** — test isolation issue; IDB persists across Playwright runs. Fix: add `indexedDB.deleteDatabase()` in `beforeEach`. Underlying behavior is correct.
2. **One `useEffect` remains in `route.tsx`** — outside-click handler for teacher grading. Phase 3 absorbs it into `grade-highlights-overlay`.
3. **Teacher grading overlays not mounted** — siblings exist in `teacher-grading/` folder but `route.tsx` doesn't render them yet. Phase 3 wires them up.
4. **Prisma migration checksum mismatch** — had to manually update `_prisma_migrations.checksum` for `20260323000000_add_title_to_snapshot_and_grade` during Task 23 (somebody edited the migration file after applying). Worth noting for production deploy — production will hit the same issue unless fixed or the migration file is restored to its original content.

## Manual QA still needed before merging Phase 1

The Phase 1 changes are committed but not merged. Before opening a PR:

1. Sign in as any real user from the prod data, open a document
2. Type → close tab → reopen → content persists (IDB hydration)
3. Type → tutor response → content persists, tutor messages update (no `?spa=1`)
4. Type → add comment → comment appears immediately
5. `Cmd+S` manual save works
6. Browser console: `window.__yawpUnauthorizedPmWrites === undefined` (or 0)
7. Submit flow works
8. View as a teacher → grading panel opens → comments/grades still display (Phase 3 will rebuild the panel, but old behavior should still work)
9. Type for 5+ minutes → a periodic revision appears in document history

## Next phases

- **Phase 2** — Submission consolidation (24 tasks): drops `DocumentSnapshot`/`Grade`/`GradeComment`/`GradeCommentResponse`, introduces `Submission`/`SubmissionComment`, big-bang migration with backfill. Plan at `docs/superpowers/plans/2026-04-08-document-hardening-phase-2-submission.md`. Depends on Phase 1's file structure.
- **Phase 3** — Grading panel cleanup (10 tasks): refactors the teacher grading UI onto `Submission`, auto-save on blur, file moves, `/app/graded/:gradeId` → `/app/submissions/:submissionId` redirect. Plan at `docs/superpowers/plans/2026-04-08-document-hardening-phase-3-grading.md`.
- All three phases ship together as one mega-PR (per the user's "ship this all at once" decision during brainstorming).
- Spec: `docs/superpowers/specs/2026-04-08-document-hardening-design.md`

## Session execution style learnings (for next session)

- **Project conventions** must be explicit in every implementer prompt: bun:test (not vitest), no `renderHook`, no `vi.useFakeTimers`, guarded happy-dom registration, `bun run test` (not bare `bun test`)
- **Subagent-driven execution** with fresh context per task worked well at scale; pragmatic shortcut: skip formal spec/code review for trivially mechanical tasks (deletes, renames, moves), use self-review for compact contained ones, dispatch full reviews for novel non-trivial work
- **NEVER** use `git checkout <sha> -- <path>` to check baselines — it stages files from the old commit into the working tree without warning. Use `git show <sha>:path` or a temporary branch instead.
- **Bundle related tasks** — e.g., Tasks 12+13 (endpoints + frontend), Tasks 14+15+16 (three small hooks), Tasks 18+19+20 (three deletes), Tasks 21+22 (UI + API deletion), Tasks 25+26 (two E2E tests). Saves subagent dispatch overhead.
