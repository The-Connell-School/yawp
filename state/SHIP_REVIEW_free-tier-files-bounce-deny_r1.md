# Independent Ship Review r1 — free-tier files, approval bounce, deny email

**Branch:** `cursor/free-tier-files-bounce-deny-3675`  
**Base:** `main` (`2cfbc98c`, #1017)  
**Reviewer:** Cloud Agent (author + reviewer for this run)  
**Date:** 2026-11-27  
**Product source:** Brian Connell, 27 Nov 2026 (weekend checklist items 3, 5, and 8; deny-email note in the later testing email)

**SHIP** for the normal merge-to-prod track. These restore expected behavior. No production feature flags were changed. Document editor v2 stays off. Exit ticket grading v2 was not flipped. Brian's open PRs were not touched.

---

## 1. Free Pre-writing and Thesis Statement files

| Intent | Evidence | Result |
| --- | --- | --- |
| Since #981, `shouldBlockSiteLicenseCourseAsset` returns true for every Thesis-Driven Essay course file when the teacher is on `FREE_CLASSROOM` and the URL has no assignment type id. The Pre-writing and Thesis Statement pages still link those decks, lesson plans, and tutorial videos. | `site-license-how-to-teach.server.ts` allow-list built from `THESIS_ESSAY_COURSE` for `pre-writing` and `thesis-statement` only | **Met** |
| Other course files stay locked. Paid teachers are unchanged. Signed-out requests stay blocked. | Unit tests in `site-license-how-to-teach.server.test.ts` | **Met** (6/6) |
| A signed-in free teacher can fetch the two lessons' files | Playwright: `free teachers can fetch Pre-writing and Thesis Statement files only` | **Met** (1 passed, 35.2s). Introduction deck and body-paragraphs video 403; Pre-writing deck, Thesis Statement deck, and Pre-writing tutorial 200 |

Brian's patch applied cleanly and the allow-list paths match the course hrefs. The older How to Teach It UI assertions in the same spec still expect `how-to-teach-site-license-locked` on the thesis guide. That guide renders "Open the course" instead, and a fresh e2e seed's thesis type is org-owned, so those two UI tests were not green here. The file regression is the new test above.

## 2. Bounced administrator approval email

| Intent | Evidence | Result |
| --- | --- | --- |
| Today there is no Resend or SES bounce webhook. Production `EMAIL_PROVIDER` is `ses` (`infra/main.tf`). A bounce is mail to the from-address inbox (info), not a teacher or team notification. The approval stays `PENDING`. | No webhook route before this change. `sendEmail` stores no provider message id | **Root cause confirmed** |
| A bounce or a final send failure marks the request (`needsManualFollowUp`, reminders stopped, `stopReason` `admin_email_bounced` or `admin_email_failed`), emails the teacher to re-enter or pick another administrator, and emails hello@ | `recordAdminApprovalUndeliverable`; pending page alert | **Met** in unit tests |
| Events can arrive from a signed Resend webhook or a signed SES SNS notification at `POST /api/email/events`. SES account suppression is polled from the approval drain when `EMAIL_PROVIDER=ses` | Webhook tests (HMAC and SNS signature). Suppression poll test | **Met** |

After deploy, bounce detection in production still needs the instance role's `ses:GetSuppressedDestination` (in this PR's Terraform) applied, and account-level suppression enabled, or an SNS subscription to `/api/email/events`. Until one of those is live, a bounce still only lands in the info inbox. Synchronous send failures are notified without that wiring.

This environment has no SES or Resend credentials and no production database, so a new live administrator email was not sent. Bryant's inbox since #1017 does not contain a new administrator approval message to confirm delivery. Demo's public `/free` page is the waitlist, which does not send that email.

## 3. Teacher denial email and asking another administrator

| Intent | Evidence | Result |
| --- | --- | --- |
| The denial email is held for one hour (`TEACHER_DENY_EMAIL_DELAY_MS`) so a reopen can cancel it | `approval-v2.server.ts`; deny integration test sees no send until `runApprovalJobs` is called after the hour | **Delay confirmed** |
| The sender is an in-process `setTimeout` (`startApprovalDelivery` in `entry.server.tsx`). App Runner throttles CPU between requests, so that timer does not run on the wall clock while the instance is idle. The job stays `QUEUED` until a request gives the process CPU long enough to finish the drain | AWS App Runner documents CPU throttling when no request is in flight. Health check is `GET /api/healthcheck` every 10s | **Root cause confirmed** |
| The health check now drains due jobs, bounded so a slow drain cannot fail the probe. Demo starts the worker even when `NODE_ENV` is not `production` | `kickApprovalDelivery` + `settleWithin`. Existing healthcheck tests still 200/503 | **Met** |
| Denying again after a reopen used to leave the cancelled `teacher_deny` row in place (`upsert` updated nothing). A second deny now schedules a new send | `replaceExisting` on the deny queue. Integration test `deny after reopen queues another teacher email and the worker sends it` | **Met** (deny suite 12/12 with `APPROVAL_V2_DB_TESTS=1`) |
| A teacher denied by one administrator can ask another from the deny screen. The application stays `SENT` or `MANUAL_REVIEW`. `forwardApprovalRequest` accepts the denied approval id | Pending route test renders the form and posts a forward. Integration test `teacher ask after deny counts toward cap` | **Met** |

Danielle Cabibbo's production row was not opened. This environment has no production database. The screen and forward path above are the ones that request uses.

---

## Reviewer-executed tests

| Suite | Result |
| --- | --- |
| `./bin/project verify --profile prepush --json` | **pass** (web-app `tsc`) |
| `bun test` site-license course asset gate | **6/6** |
| `bun test` bounce copy, recorder, webhook signatures, provider message id, healthcheck, deny screen | **pass** |
| `APPROVAL_V2_DB_TESTS=1 bun test` approval-deny integration | **12/12** |
| Playwright file-fetch spec | **1 passed** |

## Constraints

- No edits to feature flag defaults. Document editor v2 and Exit ticket grading v2 untouched.
- No edits to PRs #1010, #1012, #1013, #1014, #1019, #1020.
- No schema migration. Provider message ids are stored on the existing email-log payload.
- Terraform adds `ses:GetSuppressedDestination` next to the existing send permissions. It does not change the from-address or the provider.

## Risk notes

- Suppression polling and the webhook do nothing until the IAM change is applied or SNS/Resend is pointed at `/api/email/events`.
- The health-check drain is capped at 1.5s per probe and at most once every 30s per process. A large due backlog can take more than one probe. Claims stay in the database.
- Re-denial resets the one-hour hold. A teacher who was already emailed is emailed again after the new hour.
