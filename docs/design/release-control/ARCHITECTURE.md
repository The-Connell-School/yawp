# Release control — scoped holds and artifact-bound promotion grants

**Status:** PREPARE-ONLY prototype (Nov 2026). Production deployments remain **paused**; USO off; auto-deploy off. **Not enforced** in GitHub or AWS until Bryant re-authorizes apply + demo.

## Problem

Prose HOLD comments and draft PR instructions did not stop an automated cleanup worker from merging. Required checks and worker prompts are not a linearizable promotion boundary.

## Current delivery architecture (yawp)

| Stage | Mechanism | Enforcement today |
| --- | --- | --- |
| PR merge to `main` | GitHub PR merge / merge queue, `factory-l0` fast path in CI | Required checks; no artifact-bound grant |
| Production deploy | `.github/workflows/deploy.yml` on `push` to `main` + `workflow_dispatch` | GitHub Environment `production`, AWS keys in secrets |
| Runtime / flags | App DB + host env | Admin / Internal API / SSH (out of band) |

See `scripts/release-control/delivery-routes.ts` for route inventory and which paths bypass required checks.

## Smallest robust shape (prototype)

1. **Per-scope state** (`main_merge`, `prod_deploy`, `prod_flags`) in DynamoDB (proposed), each with:
   - monotonic **`generation`** — bumped on hold set/clear; invalidates outstanding grants
   - optional **`hold`** (temporary or permanent)
2. **Grants** — single-use (with idempotent replay), expiring, bound to exact **`commitSha`** and optional **`imageDigest`**, issued only at a **`issuedAtGeneration`** matching the scope.
3. **Fail closed** — missing, malformed, or unreachable store → deny (library default `enforcementEnabled: false` until bootstrap).
4. **Promotion-time gate** — cheap read/consume immediately before external mutation (deploy job, brokered merge), not a fat L0 CI gate.

Implementation: `scripts/release-control/` (in-memory conditional store for tests; DynamoDB adapter not provisioned).

## Trusted boundary (no worker release-writer authority)

| Component | Holds signing secret / AWS release writer? | Role |
| --- | --- | --- |
| Human + GitHub Environment approval | No (approves broker action) | Consent |
| **Promotion broker** (proposed Lambda/API) | Holds **issuer HMAC** or OIDC trust only | Verify consent, write holds/grants, audit |
| GitHub Actions workers / cloud agents | **Must not** | Call broker or read-only gate; pass signed token from broker |
| `approval_ref` string from worker | Untrusted hint | Rejected by `issueGrantFromWorkerApprovalRef` |

Workers cannot mint grants. Prototype uses HMAC test issuer (`approval-verifier.ts`); production should prefer GitHub OIDC + environment attestation feeding the broker.

## Correctness issues — honest semantics

### (1) Stale `merge_group` / green check

A passing required check at time *T* does **not** atomically block merge if a hold is placed at *T+ε*. The check is stale relative to hold state. **UNSOLVED for forge enforcement** until a merge-time gate re-reads scope state (broker API or required check backed by live store). Prototype: `evaluateMergeGateStaleCheck`.

### (2) TOCTOU after grant consume

`consumeGrant` linearizes **authorization to start** a promotion, not completion of AWS/GitHub mutations. If a hold is placed after consume but before push/deploy finishes, **in-flight operations may still complete**. Prototype documents via `describeConsumeThenHoldRace`. **UNSOLVED:** true revocation requires broker-held credentials and short-lived leases tied to mutate calls, or post-hoc reconciliation.

### (3) `approval_ref` is not consent

Only verified signed approvals (broker) count. Tests reject worker forgery.

### (4) Direct API / admin bypass

Branch protection does not constrain org admins, bypass allowances, PAT scopes, or direct AWS IAM. **Not changed in this PR.** Full enforcement requires narrowing credentials and routing all mutating paths through the broker (see delivery route inventory).

### (5) Retries and idempotency

Consume accepts duplicate **`idempotencyKey`** (workflow run + attempt) as replay-safe success. Audit append is best-effort in prototype; production needs durable audit with conditional writes.

## What this PR does **not** do

- No DynamoDB table, Lambda, IAM, or Secrets Manager apply
- No edits to branch protection, required checks, or workflow credentials
- No deploy workflow behavior change (proposed diff only)
- No touch to PR #917 auth fix branch/work

## Next approval needed (Bryant)

1. Approve **infra apply** for DynamoDB + broker Lambda + issuer secret rotation model
2. Approve **workflow integration** (deploy.yml consume step; optional merge gate check)
3. **Authorized demo** on staging: hold blocks deploy; grant with matching SHA succeeds once
4. Re-enable production deployments only after the above
