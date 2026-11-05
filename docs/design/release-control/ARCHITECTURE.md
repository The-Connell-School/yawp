# Release control — scoped holds and artifact-bound promotion grants

**Status:** PREPARE-ONLY prototype (Nov 2026). Production deployments remain **paused**; USO off; auto-deploy off. **Not enforced** in GitHub or AWS until a local contract review passes and Bryant authorizes integration separately.

## Problem

Prose HOLD comments and draft PR instructions did not stop an automated cleanup worker from merging. Required checks and worker prompts are not a linearizable promotion boundary.

## Enforcement modes (no fail-open)

| Mode | Behavior |
| --- | --- |
| `prepare_only` (default) | All promotion mutate paths deny with `fail_closed_unconfigured`. Safe for draft development. |
| `live` | Fail closed on missing/malformed/unreachable state, holds, bad grants. Never skips gates because "disabled". |

Switching to `live` without initialized scope rows still **denies** — not allow.

## Holds (deployment pause)

- Human holds are **`indefiniteUntilExplicitRelease`** — they do **not** auto-expire when wall clock advances.
- Releasing a pause requires explicit `clearHold` by an authorized subject (trusted boundary TBD for production).
- There is no timed "resume deploy" in this library.

## Grants

- Bound to **`environment` + `repository` + `operation` (scope) + `commitSha` + `imageDigest`** (digest **mandatory** for `prod_deploy`).
- **`generation`** in signed approval must match scope generation at issue time.
- **Single provider mutation:** first consume sets `providerMutationPermitted: true`; idempotent replay returns status only (`providerMutationPermitted: false`).
- Replay while a hold is active → `hold_blocks_replay` (no status shortcut that re-opens mutate).
- Grant **TTL** may expire; holds do not.

## HMAC test issuer (not human approval)

`approval-verifier.ts` uses a **fixture HMAC secret** for unit tests. It proves payload shape and signature checking only. It does **not** integrate GitHub Environment approval, OIDC, or identity of a human. See `HMAC_FIXTURE_ISSUER_DISCLAIMER`.

## Sandbox vs live providers

`sandbox-broker.test.ts` + `FakePromotionProvider` prove **ordering** in-process. They do **not** prove AWS ECR/SSM or GitHub merge enforcement.

### Provider failure recovery (honest uncertainty)

If consume permitted mutation but provider fails before completing:

- Replay with same idempotency key is **status-only** — will not permit a second mutate.
- Out-of-band reconciliation of provider state is required before issuing a **new** grant.
- If consume succeeded and provider completed, later hold does not undo completed work (TOCTOU).

## Memory store limitations

`MEMORY_STORE_CAS_LIMITATION`: in-process mutex only; no cross-process CAS. Production needs DynamoDB conditional updates.

## CI / workflow scope (draft PR)

- **Reverted** direct `ci.yml` test list changes from earlier draft — `main` workflow behavior unchanged until merge.
- Release-control tests run via `deployment-contract.test.ts` subprocess hook in this branch only after merge would activate that path.
- No active workflow credentials, environments, or deploy steps modified.

## Correctness — still UNSOLVED for forge/AWS

1. Stale `merge_group` check after hold  
2. TOCTOU: in-flight mutate after consume  
3. Admin / IAM bypass paths (`delivery-routes.ts`)  
4. DynamoDB adapter + durable audit  
5. Real human approval → broker attestation (replace HMAC fixture)

## Local contract gate (before integration approval)

1. All tests in `scripts/release-control/*.test.ts` green  
2. Ship Review r2 signed on head  
3. Explicit decision on broker credential boundary + provider reconciliation  
4. Only then: propose workflow/infra apply (separate approval)
