# Yawp Reporter

> Draft. Chat-based reporting for teachers. Status: initial vertical slice.

## Problem

Teachers want to understand their classes and students, but the app only
surfaces raw grades and per-class views. Fixed report screens are rigid — every
new question a teacher has means a new screen. We want something more flexible.

## Approach

A chat interface (Yawp Reporter) where a teacher asks questions in plain
language and an LLM answers by calling read-only, teacher-scoped data tools.
Recommended starter prompts (class grade report, student growth report, "who
needs attention?") give structure without locking the teacher into rigid
reports; free-form chat covers the long tail.

This is built on the existing `getLLMCompletion` helper, which already supports
multi-round tool use, provider fallback, and LLM logging.

## Architecture

- **Data tools** (`app/domain/reporter/`): `list_classes`,
  `get_class_grade_report` (now also returns per-skill class rubric averages),
  `get_student_grade_report`, `get_student_growth`,
  `find_students_needing_attention` (one-pass, cross-class triage ranked by
  severity), `get_submission_detail` (the actual writing evidence for one paper:
  essay excerpt, teacher inline comments, feedback, grammar issues), and the
  growth-plan pair `save_growth_plan` / `list_growth_plans`. Each is a Prisma
  query anchored to the calling teacher's `OrgMembership` and organization, so
  the model can never read another teacher's data. Only released, non-archived
  submissions are visible. Pure grade/plan math (`reporter-report.ts`) is
  separated for unit testing.
- **Persistent growth plans** (`ReporterGrowthPlan`): teacher-owned, per-student,
  org-scoped. Each stores a focus, the targeted rubric skills, the plan body, an
  optional check-in date, and a baseline snapshot (average + per-skill levels at
  creation). `list_growth_plans` recomputes current standing and diffs it against
  the baseline so later reports can report progress against the plan. One active
  plan per student (saving archives the prior active one).
- **Chat action** (`app/routes/api.domain.reporter/route.ts`): gated by
  `requireReporterAccess`, runs `getLLMCompletion` with the reporter tools bound
  to the teacher's scope, and persists each turn.
- **Persistence**: `ReporterConversation` + `ReporterMessage` (teacher-owned,
  org-scoped). Conversations are created lazily on first successful reply.
- **UI** (`app/routes/app.reporter/route.tsx`): transcript, recommended prompts,
  conversation history sidebar, optimistic send.

## Gating & rollout

Per repo policy, the feature rolls out gradually behind a per-organization flag:
`Organization.reporterEnabled` (default `false`). Admins toggle it from the org
edit sheet. The teacher sidebar entry and the `/app/reporter` route are both
gated on the flag. Local dev / preview seed enables it; production orgs stay off
until we turn them on deliberately.

## Not in this slice (follow-ups)

- Streaming responses (the LLM helper is currently non-streaming).
- Charts/visualizations in replies (growth is returned as data today).
- More tools: attendance, assignment-level breakdowns, writing-*process*
  signals (revision behavior from `DocumentRevision` / `DocumentWriteJournal`).
- Student-facing output: a share/handout rendering of a report or plan.
- Growth-plan check-in reminders (the `checkInAt` date is stored but nothing
  surfaces it yet) and a plan management UI (mark complete / archive).
- Export/share a report (print/PDF exists; no share link yet).
