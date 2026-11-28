# Ship Review r1 — scheduled approval email delivery

**Branch:** `feat/approval-delivery-scheduler` (stacked on #1021, `cursor/free-tier-files-bounce-deny-3675`)  
**Date:** 2026-11-28  
**Product source:** Bryant, 28 Nov 2026: send due approval email from an outside AWS service, not the health check.

**SHIP the app side whenever #1021 is on main. The Terraform needs a human `terraform apply`.**

## What changed

| Intent | Evidence | Result |
| --- | --- | --- |
| Due approval email (one-hour teacher denial, admin reminders, follow-ups) is sent by a scheduled job, not by luck of an in-process timer | `POST /api/jobs/approval-delivery` runs one bounded drain (`drainApprovalDelivery`). EventBridge calls it every minute (`infra/main.tf`) | **Met** once applied |
| The endpoint is not open | Header `x-internal-token` only, constant-time compare, fails closed with no configured token, 401 for query-string token, 405 for non-POST | **Met** (route tests 7/7) |
| The caller does not time out | EventBridge gives up after 5s. The request answers within 4s (`running` if the drain is slower) and the drain keeps going; the next minute joins it | **Met** (test) |
| Overlapping calls do not double-send | `drainApprovalDelivery` is single-flight per process; claims stay in the database | **Met** (unit test) |
| No new secret, no new env var | Reuses `INTERNAL_COMMAND_TOKEN` through the existing retention EventBridge connection | **Met** (still 23 env vars, 18 secrets) |
| Health check goes back to a plain database check | The drain from #1021 stays until the job is verified live, then a one-line follow-up removes it | **Staged** |

## Tests run

| Suite | Result |
| --- | --- |
| `bun test` route + runtime + deadline tests | pass |
| `scripts/deployment-contract.test.ts`, read-only impersonation contract | pass |
| `terraform fmt -check`, `terraform init -backend=false`, `terraform validate` | pass |
| `./bin/project verify --profile prepush --json` | see PR |

## Infra to apply (human only)

New: `aws_cloudwatch_event_api_destination.approval_delivery`, `aws_cloudwatch_event_rule.approval_delivery_every_minute`, `aws_cloudwatch_event_target.approval_delivery_target`. Changed in place: `aws_iam_role_policy.events_invoke_api_destination_policy` (adds the new destination to `events:InvokeApiDestination`). No new secret.

## Risks

- Until the apply, nothing calls the endpoint. The #1021 health-check drain and the in-process timer keep working, so there is no gap.
- Demo runs on its own host without App Runner throttling, so it keeps its in-process timer. The endpoint is not scheduled there.
- The existing retention destination builds its URL without `https://`. It is untouched here; the new destination uses `https://`.
