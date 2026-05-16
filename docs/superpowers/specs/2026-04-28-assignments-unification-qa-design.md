# Assignments Unification — QA Design

**Date:** 2026-04-28
**Branch:** `assignments-unification` (19 commits ahead of `main`)
**Goal:** Ship tomorrow with high confidence and minimal manual QA labor.
**Companion docs:**
- `2026-04-14-assignments-unification-design.md` (the refactor spec)
- `2026-04-20-assignments-unification-migration-delta.md` (the migration delta — used as the test oracle)

---

## 1. Framing

This branch is not a pure refactor — it's a refactor with embedded semantic changes. QA must therefore split the system under test into two regions:

| Region | % of branch | Test oracle | Strategy |
|---|---|---|---|
| **Pure rename** (table/column renames) | ~85% | Pre-state | Equivalence: post must equal pre |
| **Semantic change** (ownership cols, dropped `Document.classId`, new `assignmentTypeId`, Free Write seed, ownership-based visibility) | ~15% | Pre-state **+ declared transformations from the migration delta doc** | Contract: post must equal pre × T(spec) |

The migration delta doc (357 lines, every "After state" + "Verification assertions" block) IS the oracle for the semantic-change region.

## 2. Non-goals

Explicit cuts for speed:

- **No golden-response capture/replay** — covered by behavior contracts on the high-risk paths
- **No visual regression suite** — agentic pass catches UI weirdness
- **No performance regression baseline** — assumed unchanged (no new queries, schema shape only)
- **No coverage of flows outside the 5 contracts and 2 agentic personas** — accepted gap

These are reusable infra investments and would be valuable for future PRs, but they don't ship this PR.

## 3. Three QA layers

The full pyramid we considered was 6 layers (type check, DB assertion, behavior contracts, golden-response replay, visual regression, agentic exploratory). Layer 1 (type check) is already passing. Layers 4 + 5 are the explicit cuts in section 2. The numbering below preserves the original layer indices so the framing maps cleanly to follow-up PRs that may add layers 4 + 5.

### Layer 2 — Postcheck with transformation expectations

**Modify `assignments-unification-preflight.ts`**: in addition to printing to stdout, write all captured state to `/tmp/assignments-unification-preflight.json` (configurable via `PREFLIGHT_STATE_PATH` env var). State includes:
- Row counts for every affected table (16 tables — full set from migration delta §10)
- Pre-state document bucket counts (7a, 7b, 7c)
- The `Document.id → Assignment.assignmentTypeId` map for the 8 assigned docs (used in postcheck parity check)

**Modify `assignments-unification-postcheck.ts`** to read that file (if present) and assert all transformations described in migration delta §12:

- Every renamed-table count exactly matches pre-state (no row loss across 14 renames)
- `AssignmentType` count = pre + 1 (Free Write seed inserted)
- `Document.assignmentTypeId IS NOT NULL` for every doc (already covered)
- For all 8 docs with `assignmentId`: `Document.assignmentTypeId = Assignment.assignmentTypeId` (pass 7a parity)
- `AssignmentModule.assignmentTypeId` has zero NULLs
- All 6 `AssignmentType` rows have both `ownerOrgId` and `ownerTeacherId` NULL (system-owned baseline)
- Every renamed old table absent: `StudentCourse`, `StudentCourseImage`, `StudentCourseModule`, `StudentCourseModuleInstruction`, `StudentCourseModuleInstructionButton`, `StudentCourseModuleSession`, `StudentCourseModuleSessionMessage`, `TeacherCourse`, `TeacherCourseImage`, `TeacherCourseModule`, `TeacherCourseModuleResource`, `TeacherCourseResource`, `TeacherCourseModuleSession`, `ClassStudentCourse`
- `Document.classId` column absent
- Pass 7c bucket size matches pre-state estimate (`documents - 8 - pass7b`)

If preflight state file is missing, postcheck falls back to existing plausibility checks and warns that strict transformation assertions were skipped (so the script remains usable in environments without preflight state).

Output: single `OK` line on success, or a failure report with row-level detail and exit code 1.

### Layer 3 — Behavior contracts

New test file: `services/web-app/app/__migration-tests__/assignments-unification-contracts.test.ts`
Framework: `bun:test` (project standard per CLAUDE.md / AGENTS.md).
Run: against a migrated DB (local prod-restored first, then preview env).

| # | Contract | Asserts |
|---|---|---|
| **C1** | Ownership visibility | A teacher's owner-scoped AssignmentType picker returns the 6 system types and 0 org/teacher-owned (current state of all rows is system-owned) |
| **C2** | Free Write availability | Any authenticated user can create a Document with `assignmentTypeId = 'cfreewrite0000000000000000'` and load that doc through `app_.documents_.$id` route without errors |
| **C3** | Document → Class derivation | For a fixture assigned doc, the route resolves class via `Document.assignmentId → Assignment.classId`. For a fixture unassigned doc, the student's class membership is reachable from `profileId → StudentProfile → classes`. |
| **C4** | Backfill correctness sample | Pick 5 random docs from each pass bucket (7a / 7b / 7c) and assert `assignmentTypeId` matches the bucket's derivation rule (Assignment-derived / earliest-session-derived / Free Write) |
| **C5** | Whitelist removal effect | A pre-existing teacher in any class lists all 6 system AssignmentTypes (vs. previously filtered by `ClassStudentCourse`) — verifies no teacher loses access to a type they could use before |

Each contract is one focused test. Total: ~5 tests, ~2 hours to write. They are forever-tests — they document the change permanently and run on every CI run after merge.

Test fixtures: leverage the e2e seed overlay where possible; create minimal fresh fixtures otherwise.

### Layer 6 — Agentic exploratory pass

Run after preview deploys with the migration applied. Two prompted Claude Code subagents in parallel against the preview URL using seeded creds (`teacher@fake.test` / `teacher123`, `student@fake.test` / `student123`).

**Implementation (primary path):** invoke from an active Claude Code session — Bryant runs the QA pass from a terminal session that spawns two parallel subagents via the `Agent` tool. Each subagent receives the persona prompt, the migration delta doc inlined, and the preview URL. Each uses Playwright (already installed via `bunx playwright install`) for browser automation and writes a markdown report to `tmp/qa-reports/<persona>-<timestamp>.md`.

**Why this path:** zero new infra. The Claude Code session itself is the runner; the Agent tool already supports parallel subagents; Playwright is already installed.

**Fallback path (if Bryant prefers headless / scheduled runs):** a standalone driver script `services/web-app/scripts/qa-agent-pass.mjs` using the Anthropic SDK directly. Defer this implementation unless needed.

**Teacher prompt:**
> You are a teacher logged into YAWP at `<preview-url>` as `teacher@fake.test` / `teacher123`. The branch under test makes the changes documented in the attached migration delta spec (§11 relationships, §12 verification checklist). Spend up to 5 minutes exercising: creating an Assignment using the AssignmentType picker, viewing your class page with student work, opening a student's document, and grading. Report anything that looks broken, surprising, or inconsistent with the spec. Output: a markdown report listing observations grouped by severity (blocker / concern / nit / no-issue-found).

**Student prompt:**
> You are a student logged into YAWP at `<preview-url>` as `student@fake.test` / `student123`. Spec context attached. Spend up to 5 minutes exercising: opening an existing document, starting a new Free Write, working through one tutor module session, submitting an essay. Report anything that looks broken, surprising, or inconsistent with the spec. Same output format as the teacher persona.

Reports are reviewed by Bryant before merge. A "blocker" report from either agent gates the merge.

## 4. Sequencing for ship-tomorrow

| Step | Where | What | Time |
|---|---|---|---|
| 1 | Local | Implement layer 2 (modify preflight + postcheck scripts) | ~45 min |
| 2 | Local | Implement layer 3 (5 contract tests) | ~2 hr |
| 3 | Local | Implement layer 6 driver script | ~30 min |
| 4 | Local | Restore fresh prod dump → preflight → migrate → postcheck → contracts | ~30 min |
| 5 | Fix | Address anything red from step 4 | variable |
| 6 | Local | Re-run step 4 until green | ~10 min |
| 7 | PR | Open PR for `assignments-unification` → preview env auto-deploys (migration runs) | ~10 min for deploy |
| 8 | Preview | Re-run postcheck + contracts against preview DB | ~5 min |
| 9 | Preview | Run layer 6 agentic pass | ~10 min |
| 10 | Review | Read agent reports, triage findings | ~15 min |
| 11 | Merge | If all green and reports clean, merge + deploy | — |

**Estimated total active engineering time: ~4–5 hours** (excluding wait time on preview deploy and agent runs).

## 5. Done criteria

A merge is allowed when all of the following hold:

- [ ] Local: `assignments-unification-postcheck.ts` exits 0 against migrated local DB
- [ ] Local: All 5 behavior contracts pass (`bun run test --filter assignments-unification-contracts`)
- [ ] Preview: Same two passes hold against preview DB
- [ ] Preview: Both agentic reports contain no `blocker` items (concerns and nits documented for follow-up but non-gating)
- [ ] CI: Existing e2e suite passes against preview env
- [ ] Type check passes (already verified by branch's 19 rename commits)

## 6. Risks and accepted gaps

| Risk | Likelihood | Mitigation |
|---|---|---|
| Behavior contract C4 picks unrepresentative random docs and misses a bucket-edge bug | Low | 5 docs per bucket × 3 buckets = 15 docs sampled; bucket sizes are 8 / 2585 / 45, so 7a is exhaustively sampled, 7c is heavily sampled, 7b is randomly sampled at 0.2% |
| Agentic pass misses a regression a human would catch | Medium | Bryant does a 5-minute manual gut check of the highest-traffic flow (student opens existing doc) before merge |
| Preview env DB schema diverges from prod (e.g., manual hotfixes prod-only) | Low | Preview restores the same prod dump used elsewhere; assume parity per platform setup |
| Free Write seed row collides with existing data | None | ID `cfreewrite0000000000000000` is novel; preflight would catch a collision |
| Forward-planning gaps not addressed | Accepted | Out of scope for ship-tomorrow; addressed in separate spec when ownership types are actually used |

## 7. What gets reused for future PRs

- The preflight-state-capture pattern is generic; future migrations can copy it
- The `__migration-tests__` directory becomes the home for behavior contracts on every migration
- The agentic driver script is reusable with new prompts per refactor

These investments don't ship this PR but compound across future refactors.
