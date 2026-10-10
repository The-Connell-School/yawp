# Code review: UA Stripe sandbox on demo

Scope reviewed: `eafa3e94` against `origin/main`.

## Result

No blocking findings.

## Checks

- Demo-only GitHub environment names keep sandbox credentials separate from production and PR-preview credentials.
- Billing fails closed when enabled with any required value missing.
- Every declared `PREVIEW_` value is forwarded through the SSH boundary; the existing contract test enforces this.
- The normal demo deploy still defaults `reset_data` to `false` and retains the aggregate count non-decrease assertion.
- The workflow verifies UA branding through the UA hostname after the access gate is established.
- Secrets are neither printed in the job summary nor stored in repository files.

## Residual risk and rollback

- A bad sandbox credential can stop a new demo rollout but cannot reset or reduce demo data.
- Roll back by dispatching the demo workflow with the prior deployed SHA and setting `DEMO_UA_STUDENT_BILLING_ENABLED=false`.
