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
  `get_class_grade_report`, `get_student_grade_report`, `get_student_growth`.
  Each is a Prisma query anchored to the calling teacher's `OrgMembership` and
  organization, so the model can never read another teacher's data. Only
  released, non-archived submissions are visible. Pure grade math
  (`reporter-report.ts`) is separated for unit testing.
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
- More tools: attendance, assignment-level breakdowns, cross-class comparisons,
  writing-quality signals from rubric scores.
- Markdown rendering of assistant replies (currently plain text).
- Export/share a report.
