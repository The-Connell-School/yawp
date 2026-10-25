# Ship review — PR #728 (round 1)

| Field | Value |
| --- | --- |
| **Verdict** | **SHIP** |
| **Reviewed head** | `69e27d64c972c0afa6ca3e75c0475eaba884955e` |
| **Live PR head (re-checked)** | `69e27d64c972c0afa6ca3e75c0475eaba884955e` (unchanged) |
| **PR** | https://github.com/The-Connell-School/yawp/pull/728 |
| **Scope** | 9 files vs `origin/main` (+814 LOC) |

## Purpose

Idempotent ensure of **Thomas Patton** and **Ava Crossman** as teachers in `local-dev-org` on demo (`yawp_demo`), each with a dedicated non-archived class (`INTERN-QA-TP`, `INTERN-QA-AC`) at 0 students, plus a **workflow_dispatch-only** GitHub Action to run on the demo host without reset/truncate/email.

## Checklist

| Requirement | Result | Notes |
| --- | --- | --- |
| No `reset_data` / truncate / `seed-local-dev` wipe | **Pass** | Absent from workflow, host script, and ensure module. Host script test asserts no `reset_data`/`truncate`. |
| No invite/email send paths | **Pass** | Ensure only upserts users/memberships/classes and sets password hash locally; no mail/invite imports or calls. |
| Refuses production; demo / `yawp_demo` only | **Pass** | `assertEnsureInternQaTeachersTarget` throws on `yawp_production` URL or `YAWP_ENVIRONMENT=production`. Host command sets `ENSURE_INTERN_QA_REQUIRE_DEMO=1`, `PREVIEW_SLUG=demo`, `DATABASE_NAME=yawp_demo`. Workflow `environment: demo`, `demo-environment` concurrency, demo SSH/rsync pattern. |
| Idempotent ensure; named teachers; empty classes | **Pass** | Integration test runs ensure twice; expects 2 teachers, `studentCount === 0`, stable class codes. Names fixed in specs. Re-run updates names/memberships; existing intern QA classes with students are cleared to empty (scoped to `INTERN-QA-*` codes only). |
| `workflow_dispatch` only and safe | **Pass** | YAML `on` is only `workflow_dispatch`. Deployment-contract test locks this. No `schedule`/`push`. |
| Tests | **Pass** | Guard/unit/mock tests in `ensure-intern-qa-teachers.test.ts`; optional Postgres integration from `yawp_migration_ci` template; host script static guard test; CI job added; deployment-contract test for workflow shape. Ran locally: 5/5 ensure tests, 1/1 host script test, 1/1 deployment-contract slice. |
| No secrets printed | **Pass** | Workflow validates SSH key presence without echoing it; step summary prints ensure summary lines (names/emails/org/class metadata). No password or private key in output. |
| No Kevin PR touch; no prod flags | **Pass** | Diff limited to intern-QA ensure + demo workflow + related tests; no Kevin references; no production enablement flags. |

## Sign-in-as (demo / `local-dev-org`)

On gated preview/demo hosts, `getLocalDevLoginOptionsPage` lists active org members from the database (not only static personas). Ensured users have `TEACHER` membership in `local-dev-org` and `simulatedForClassId: null`, so they appear in **Sign in as** with labels from `user.name` (**Thomas Patton**, **Ava Crossman**). Emails prefer crimson addresses when safe, else `dev.teacher.{thomas,ava}@yawp.local`.

## Residual risks (non-blocking)

1. **Demo guard env vs URL** — `isDemoInternQaEnvironment` treats `PREVIEW_SLUG=demo` or `DATABASE_NAME=yawp_demo` as sufficient alongside URL checks; host script sets these explicitly. Mis-set `DATABASE_URL` on the host would still be a config bug; production URL remains hard-refused.
2. **Student detach** — If an `INTERN-QA-*` class already had enrollments, ensure disconnects all students to preserve “empty class” for Populate class QA. Intentional for dedicated intern codes, not a global wipe.

## Commands verified locally

```bash
bun test ./packages/prisma/scripts/local-dev/ensure-intern-qa-teachers.test.ts
bun test ./scripts/preview/ensure-intern-qa-teachers-on-demo-host.test.ts
bun test ./scripts/deployment-contract.test.ts -t "demo intern QA teachers"
```

## Decision

**SHIP** at `69e27d64c972c0afa6ca3e75c0475eaba884955e` — additive demo-only ensure with production refusal, dispatch-only workflow, appropriate tests, and no reset/truncate/email paths.
