# Teacher Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the teacher-workspace redesign on `codex/yawp-class-dashboard-fixtures`: procedural (non-gradient) class art, compact class header, Students+Documents class tabs, a teacher-level Assignments surface, a more powerful Student Work page, a dashboard that launches the three teacher jobs, and consistent status language everywhere.

**Requirements source:** `docs/superpowers/specs/2026-06-09-teacher-workspace-requirements-from-granola.md` (Bryant's decisions there supersede AGENTS.md's feature-flag rule for this redesign — no new flag; existing `assignments_enabled` etc. flags keep working as-is).

**Architecture:** All work is UI/route-level in `services/web-app`. No schema changes. `cardGradientKey` stays in the DB (still written on class create) but the UI stops reading it; class art becomes a deterministic SVG generated from the class id. A shared `teacher-document-status` util becomes the single source of truth for the In Progress / Needs Grading / Graded / Released lifecycle. Assignment CRUD moves to a new `/app/assignments` route reusing the existing `AssignmentCreationSheet` (bulk `/api/assignments/create`) and a relocated edit sheet. The class route keeps its action intents (legacy posts target it) but drops the Assignments tab and dead tab renders.

**Tech stack:** React Router v7 file routes, Prisma, shadcn-style UI components, bun test (unit, `route.test.ts` with `mock.module` pattern), Playwright e2e (`services/web-app/e2e`).

**Worktree:** `/Users/bryantbrock/.codex/worktrees/5623/yawp` on `codex/yawp-class-dashboard-fixtures`. Commit after every task.

**Verification commands** (run from `services/web-app`):
- Unit: `bun test app/`
- E2E (targeted): `bunx playwright test --project=chromium e2e/tests/<spec>`
- Typecheck: `bun run typecheck` (verify script name in package.json; fall back to `bunx tsc --noEmit`)

---

### Task 1: Shared teacher document status util

**Files:**
- Create: `services/web-app/app/utils/teacher-document-status.ts`
- Create: `services/web-app/app/utils/teacher-document-status.test.ts`
- Modify: `services/web-app/app/utils/teacher-class-card-stats.server.ts` (reuse shared `hasMeaningfulGrade`)

- [ ] Write failing unit tests covering: no submission → `in-progress`; submission without meaningful grade → `needs-grading`; meaningful grade (each signal: gradedAt, score, feedback, overallComment, letterGrade, numericPercentage 0, non-empty rubricScores) without release → `graded`; releasedAt set → `released`; label map (`In Progress`, `Needs Grading`, `Graded`, `Released`); badge classes (muted/gray for in-progress, yellow/orange for needs-grading, blue for graded, green for released).
- [ ] Implement:

```ts
export type TeacherDocumentStatus =
  | 'in-progress' | 'needs-grading' | 'graded' | 'released';

export function hasMeaningfulGrade(s: {
  score?: string | null; feedback?: string | null;
  rubricScores?: unknown | null; overallComment?: string | null;
  numericPercentage?: number | null; letterGrade?: string | null;
  gradedAt?: Date | string | null;
}): boolean { /* same signals as class route today, incl. gradedAt */ }

export function getTeacherDocumentStatus(latestSubmission: (... ) | null): TeacherDocumentStatus
export const TEACHER_DOCUMENT_STATUS_LABELS: Record<TeacherDocumentStatus, string>
export const TEACHER_DOCUMENT_STATUS_BADGE_CLASSES: Record<TeacherDocumentStatus, string>
export const TEACHER_DOCUMENT_STATUSES: TeacherDocumentStatus[]
```

  Badge classes match current app idiom: in-progress `bg-muted text-muted-foreground border-transparent`, needs-grading `bg-yellow-100 text-yellow-800 border-yellow-200`, graded `bg-blue-100 text-blue-700 border-blue-200`, released `bg-green-100 text-green-700 border-green-200`.
  Note: `teacher-class-card-stats.server.ts`'s current `hasMeaningfulGrade` does NOT check `gradedAt`; the class route's does. Standardize on including `gradedAt` (a teacher pressing "grade" with empty fields still counts as graded).
- [ ] `bun test app/utils/teacher-document-status.test.ts` → PASS; `bun test app/` green.
- [ ] Commit: `feat: add shared teacher document status util`

### Task 2: Deterministic procedural class art

**Files:**
- Create: `services/web-app/app/utils/class-art.ts` (pure, unit-testable)
- Create: `services/web-app/app/utils/class-art.test.ts`
- Create: `services/web-app/app/components/class-art.tsx` (SVG renderer)

- [ ] Write failing unit tests: same class id → identical spec across calls; two different ids → different spec (test a handful of ids, expect at least variant or element differences); all colors emitted come from the Yawp palette constant; element counts bounded (sparse: e.g. ≤ 120 elements).
- [ ] Implement `class-art.ts`:
  - `hashSeed(seed: string): number` (FNV-1a or similar), `mulberry32(seed)` PRNG.
  - Palette constant: burned orange `hsl(14.9 58.9% 57%)` (+ a deeper orange), charcoal `#262626`/`#404040`, muted neutrals `#a3a3a3`/`#d4d4d4`/`#e7e5e4`, paper white `#fafaf9`. Background always paper white / warm neutral; marks mostly neutral/charcoal with orange accents so overlaid text stays legible.
  - `generateClassArt(seed: string): ClassArtSpec` — picks 1 of 4 motifs deterministically: `grid-blocks` (small filled squares on a coarse grid), `ruled-lines` (horizontal rules + a few plotter strokes), `glyph-field` (sparse `+ × · —` glyphs on a grid), `contour` (a few polyline traces from a random walk). Spec is plain data: `{ motif, background, elements: Array<Rect | Line | Text | Polyline> }` with fixed viewBox `0 0 320 128`.
- [ ] Implement `class-art.tsx`: `<ClassArt seed={classId} className=... />` renders the spec as inline `<svg>` (aria-hidden, `preserveAspectRatio="xMidYMid slice"`), memoized on seed.
- [ ] `bun test app/utils/class-art.test.ts` → PASS.
- [ ] Commit: `feat: add deterministic procedural class art system`

### Task 3: Class cards use procedural art (dashboard + My Classes)

**Files:**
- Modify: `services/web-app/app/components/teacher-class-card.tsx`
- Modify: `services/web-app/app/routes/app._index/route.tsx`, `app.my-classes._index/route.tsx` (drop `cardGradientKey` from selects/types; keep writing it on create)
- Test: `services/web-app/e2e/tests/teacher.class-cards.spec.ts` (new, small)

- [ ] Write e2e first: class card on `/app/my-classes` shows class label, student/assignment counts, contains an `svg[data-testid="class-art"]`, and has no `bg-gradient-to-br` class; clicking card opens class detail. Run → FAIL.
- [ ] Update `TeacherClassCard`: replace gradient band with `<ClassArt seed={klass.id} />` band (slightly taller, card overall more square: art band `h-36`), class identity text moves below the art onto plain background (charcoal on white — no white-on-image text, no dark overlay), keep count badges (students, assignments, needs-grading orange, ready-to-release blue with existing tooltips). Remove `cardGradientKey` from `TeacherClassCardData`.
- [ ] Remove `cardGradientKey` reads from loaders (`app._index`, `app.my-classes._index`, class detail loader in Task 5); keep `generateClassCardGradientKey` write in the create action (back-compat, untouched DB).
- [ ] Run new e2e spec → PASS. `bun test app/` green (fix `app._index/route.test.ts` if select shape asserted).
- [ ] Commit: `feat: replace class card gradients with procedural art`

### Task 4: Teacher-level Assignments surface + nav

**Files:**
- Create: `services/web-app/app/routes/app.assignments._index/route.tsx`
- Create: `services/web-app/app/routes/app.assignments._index/route.test.ts` (action unit tests)
- Create: `services/web-app/app/components/assignments/assignment-edit-sheet.tsx` (moved from `app.my-classes.$classId/assignment-sheet.tsx`, gains optional `action` prop and `classId` becomes optional/`fixedClassId`-style)
- Modify: `services/web-app/app/components/assignments/assignment-creation-sheet.tsx` (add optional `initialTitle`, `initialDueDate`, `initialSubmitForGrade`, `initialPointValue`, `initialTutorContext` for duplicate flow)
- Modify: `services/web-app/app/routes/app/route.tsx` (nav LINKS: add `Assignments` with `ClipboardList` icon after Student Work, `requires` teacherProfile)
- Test: `services/web-app/e2e/tests/teacher.assignments-page.spec.ts` (new)

Route URL `/app/assignments` does not conflict with `app.assignments.$assignmentId.start` (POST-only student start).

- [ ] Write e2e first (FAIL): nav shows `Assignments`; page lists seeded assignment with Title / Assignment Type / class label / Documents count; `New Assignment` opens the shared creation sheet (assert `Assignment type` + `Assign to` labels — same form as dashboard spec helper); creating with the seeded class checked creates a DB row (reuse `expectCreatedAssignment` pattern); Edit updates title; Duplicate opens prefilled sheet; Delete removes the assignment while the seeded document (`assignmentId` SetNull) still exists in DB. No `Assignment Preset` text anywhere.
- [ ] Loader: teacher-only (redirect `/app` otherwise). Load non-archived teacher classes (id/grade/period/title + school org/school ids), assignments across those classes (`title, prompt, tutorContext, dueDate, submitForGrade, pointValue, assignmentTypeId, assignmentType {id,title,systemKey}, class {id,grade,period,title}, _count.documents`), allowed assignment types via `getAvailableAssignmentTypesForScopes` (exclude AP History key for generic create/edit, same as class route), `assignmentsEnabled` + `assignmentCreationStandardizationEnabled` flags. If assignments flag disabled → render quiet empty state explaining assignments aren't enabled.
- [ ] Action intents (unit-test with the `mock.module` prisma pattern copied from `api.assignments.create/route.test.ts`):
  - `update-assignment`: same validation as class route (type allowed or preserved-archived, AP History blocked, prompt required, due date valid, grading intent when standardization enabled) but authorizes via `assignment.class.teachers some teacherProfile` instead of route classId.
  - `delete-assignment`: authorize same way; `prisma.assignment.delete`; documents survive via SetNull (assert in test that no document mutation happens).
  - Creation goes through existing `/api/assignments/create` (sheet `entryPoint="dashboard"` form action) — no new create code.
- [ ] UI: compact header block (`Assignments`, copy: create assignments and apply them to your classes), `New Assignment` button. Toolbar: filter by class (Select), filter by Assignment Type (Select), clear. Table: Title (+ one-line prompt preview), `Assignment Type`, `Applied to` (class label, linking to `/app/my-classes/:id?tab=documents&assignmentId=:assignmentId`), Due date, Documents count badge, Actions: Edit (sheet), Duplicate (creation sheet prefilled from row, classes unchecked), Delete (confirm dialog noting student documents are kept). No In Progress/Submitted/Graded/Released columns — that lives in Student Work.
- [ ] Wire nav link. Run unit tests → PASS; run e2e spec → PASS.
- [ ] Commit: `feat: add teacher-level Assignments surface`

### Task 5: Class detail redesign (header + Students/Documents tabs)

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`
- Delete: `services/web-app/app/routes/app.my-classes.$classId/assignment-sheet.tsx` (superseded by shared edit sheet; class action keeps `create/update/delete-assignment` intents for legacy posts from the assignment-type page creation sheet)
- Modify: `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts` (rewrite to final IA)
- Check/Modify: `services/web-app/e2e/tests/teacher-class-pilot-rollout.spec.ts`, `teacher.class-sorting-filtering.spec.ts`, `teacher.class-essay-column.spec.ts` for assumptions about removed tabs (update or retire assertions that contradict the final IA)

- [ ] Rewrite `teacher.class-page-redesign.spec.ts` first (FAIL): tabs exactly `Students` and `Documents` (no `Assignments` tab); default tab Students; compact header shows class name, school name, school year, class code, grade/period, student + document counts, `Edit Class` button, back link, `svg[data-testid="class-art"]`, and no `bg-gradient-to-br`; `?tab=assignments` redirects to `/app/assignments`; Documents tab shows status filter and uses `In Progress` (not `Draft`) and `Needs Grading` (not `Submitted`) pill labels; `View details` on an in-progress row goes to `/app/documents/...`, on a submitted row goes to `/app/submissions/...`.
- [ ] Header: replace hero block with compact header — left: back chevron link, `h1`-style class title (`title || Grade X • Period Y`), meta line (school · schoolYear · Period · Grade · code badge with copy affordance optional), count chips (Students n, Documents n, Needs Grading n in orange when >0, Released n green) computed from already-loaded data; right: `Edit Class` button; thin `ClassArt` accent strip (e.g. `h-14` band or square thumb) — quiet, not a hero. Released-grades link stays (as a small header link) when flag enabled.
- [ ] Tabs: `validTabs = ['students','documents']`; loader/`activeTab` fallback `students`; in the component, if `requestedTab === 'assignments'` → `redirect`/`Navigate` to `/app/assignments`; keep `tab=to-release` sheet-opening effect.
- [ ] Documents tab: add `status` search param filter (`all | in-progress | needs-grading | graded | released`) applied to `filteredClassDocuments` via `getTeacherDocumentStatus(document.latestSubmission)`; status Select next to student/assignment filters; `Clear filters` clears it too. Replace `getClassDocumentStatus` internals with shared util (labels `In Progress`/`Needs Grading`/`Graded · {grade}`/`Released · {grade}`, shared badge classes). Keep grouping + collapsible groups + version `vN` only when ≥2 submissions.
- [ ] Remove: Assignments tab trigger/render, assignment sort/type-filter state, `AssignmentSheet` usage and file, dead renders for `in-progress`/`to-grade`/`graded`/`released`/`paste-activity` tabs and the now-unused state they carry (keep `unreleasedGrades`/release sheet machinery used by `tab=to-release`). Keep loader's `assignments` (documents filter + counts) and `pasteAlerts` only if still rendered — paste alerts are no longer rendered: drop the query and the paste-content sheet.
- [ ] Trim loader: drop `cardGradientKey`, drop `allowedAssignmentTypes`/standardization data only if no longer needed by kept action intents (action revalidates its own needs — the action reloads types itself; loader can stop passing them since the sheet is gone).
- [ ] Run rewritten spec → PASS; run `teacher-class-pilot-rollout`, `teacher.class-sorting-filtering`, `teacher.class-essay-column`, `teacher.grading-flow`, `teacher.released-grades` e2e — update any that asserted the old tabs/hero (document each change in the commit message); `bun test app/` green (update `app.my-classes.$classId/route.test.ts`).
- [ ] Commit: `feat: redesign class detail header and tabs around Students + Documents`

### Task 6: Dashboard reshaped into teacher command center

**Files:**
- Create: `services/web-app/app/routes/app._index/components/teacher-workspace-cards.tsx`
- Modify: `services/web-app/app/routes/app._index/route.tsx` (teacher branch + loader trim)
- Delete from teacher dashboard: `assignment-types-list.tsx` + `dashboard-create-assignment-sheet.tsx` + `teacher-assignments-list.tsx` usage (delete files if nothing else imports them; `assignment-types-list.test.ts` goes with its component)
- Modify: `services/web-app/e2e/tests/teacher.dashboard-assignment-types.spec.ts` → rename/rewrite as `teacher.dashboard-workspace.spec.ts`; update `package.json` `test:e2e:smoke` list accordingly
- Modify: `services/web-app/app/routes/app._index/route.test.ts`

Note: the current smoke spec asserts `Classes at a Glance`, `Teacher's Lounge`, and `Assignment Types` headings that this branch already removed — it is already red; this task makes the dashboard + spec consistent.

- [ ] Rewrite the dashboard e2e first (FAIL): `/app` shows `My Classes` section with class card linking to class detail; an `Assignments` card with assignment count linking to `/app/assignments`; a `Grading` card showing needs-grading count and linking to `/app/student-work?status=needs-grading`; no `Teacher's Lounge` section on the dashboard; no `Assignment Types` heading. Keep the multi-class creation coverage by moving those creation tests to the Assignments-page spec context (creation from `/app/assignments` sheet — already covered in Task 4's spec; the assignment-type-page creation test stays, pointed at `/app/assignment-types/:id` which is unchanged).
- [ ] `TeacherWorkspaceCards` component: two compact cards in a responsive grid. `Assignments`: ClipboardList icon, total assignment count, "Create and apply assignments to your classes", links to `/app/assignments`. `Grading`: ClipboardCheck icon, `Needs Grading` count (orange badge when >0), `Ready to Release` count (blue), all-clear state renders a green check + "All caught up" when both are 0 (the "everything is green" feeling); links to `/app/student-work?status=needs-grading` (or `/app/student-work` when 0).
- [ ] Loader (teacher branch): keep `teacherClassCards` (stats give per-class ungraded/graded-unreleased → sum for Grading card); add cheap `prisma.assignment.count({ where: { class: { teachers: { some: ... }, isArchived: false } } })`; drop the `teacherAssignments` findMany and assignment-type fetch for teachers (students keep their courses fetch); drop `studentProfiles`/`teacherSchoolCount` if now unused (verify before removing). Update `route.test.ts` expectations.
- [ ] Teacher render: header copy → "Your classes, assignments, and grading in one place."; body = `ClassesAtAGlance` then `TeacherWorkspaceCards`. Remove `AssignmentTypesList`/`TeacherAssignmentsList` imports; delete orphaned component files (grep first for other importers).
- [ ] Run dashboard e2e → PASS; `bun test app/` green; update smoke list in `package.json`.
- [ ] Commit: `feat: reshape teacher dashboard into workspace launch surface`

### Task 7: Student Work parity (filters, grouping, status, release visibility)

**Files:**
- Modify: `services/web-app/app/routes/app.student-work._index/route.tsx`
- Test: `services/web-app/e2e/tests/teacher.student-work.spec.ts` (new)

- [ ] Write e2e first (FAIL): page shows status summary chips with counts (Needs Grading / Graded / Released / In Progress); status pills use shared labels (seeded data: one in-progress doc → `In Progress`, submitted → `Needs Grading`, graded-unreleased → `Graded`, released → `Released` with green styling); `?status=needs-grading` filters rows; student filter narrows; group-by-class renders collapsible group headers with counts; search input narrows by document title; `Open` on submitted work goes to `/app/submissions/...` and the page URL round-trips via `exitTo`.
- [ ] Loader: extend submission select with grade-signal fields (`score, feedback, rubricScores, overallComment, numericPercentage, letterGrade, gradedAt, releasedAt`) + `_count: { select: { submissions: true } }` on document for `vN`; add `status`, `group`, `q` params; `q` server-side where (`OR`: doc title contains, profile user name/email contains, assignment title contains; mode insensitive); status filtering applied after fetch via `getTeacherDocumentStatus` (cap stays 250); compute `statusCounts` over the unfiltered-by-status set; add `isDocumentSubmissionEnabledForScope` so submitted links use `edit=1&` like the class page (grading turnaround).
- [ ] UI: status summary chips row (each chip sets `status` param; released chip green; needs-grading orange) above toolbar; toolbar adds search Input (debounced submit on Enter is fine), status Select, and Group Select (`none | class | student | assignment`); grouped rendering reuses the Collapsible pattern from the class Documents tab (extract a small shared component only if copy-paste exceeds ~60 lines — otherwise keep local); status pills via shared util with grade shown when graded/released (`Graded · 92%`), `vN` shown only when document has ≥2 submissions.
- [ ] Run e2e spec → PASS; `bun test app/` green.
- [ ] Commit: `feat: bring Student Work to parity with class documents`

### Task 8: Status-language sweep, stress fixture, full verification

**Files:**
- Create: `services/web-app/scripts/seed-student-work-stress.ts` (dev-only script: seeds ~50 graded docs for one student in a class — mirrors `backfill-class-card-gradients.ts` script shape; args: classId, studentEmail)
- Modify: anything the sweep finds

- [ ] Sweep teacher surfaces for stray lifecycle words: `grep -rn "'Draft'\|\"Draft\"\|Submitted" services/web-app/app/routes/app.my-classes* services/web-app/app/routes/app.student-work* services/web-app/app/routes/app._index services/web-app/app/components/teacher-class-card.tsx` — replace teacher-facing `Draft`/`Submitted` pill text with shared labels (leave student-facing surfaces like `DocumentLink` and intentional local labels alone, per spec).
- [ ] Write the stress seed script; run it against the local dev DB, load the class Documents tab and Student Work grouped by student, fix any layout overflow it reveals (long group headers, pagination with grouping, sticky toolbar wrap on mobile widths).
- [ ] Full verification: `bun test app/` (all unit), `bunx playwright test --project=chromium` for the touched specs (`teacher.class-cards`, `teacher.assignments-page`, `teacher.class-page-redesign`, `teacher.dashboard-workspace`, `teacher.student-work`, plus current smoke list), typecheck/lint per repo scripts.
- [ ] Spec acceptance-criteria checklist pass (spec lines 384–404) — record any intentional deviations in the commit message.
- [ ] Commit: `chore: status-language sweep, stress fixtures, verification`

---

## Self-review notes

- Spec coverage: dashboard (Task 6), class cards/art (Tasks 2–3), My Classes (Task 3, existing flows kept), class header/tabs/Students/Documents (Task 5), teacher Assignments (Task 4), Student Work/Grading (Tasks 6–7), status/release consistency (Tasks 1, 5, 7, 8), navigation (Task 4), no-feature-flag + data-safety (no schema change; delete = SetNull; class action intents kept for legacy posts).
- Terminology: only `Assignment` / `Assignment Type` used anywhere; no `Preset`/`Template`.
- Old links preserved: `/app/my-classes/:id?tab=assignments` redirects to `/app/assignments`; `tab=to-release` behavior kept; `released-grades` route untouched.
- Type consistency: `getTeacherDocumentStatus` consumed in Tasks 5 and 7; `ClassArt` consumed in Tasks 3 and 5.
