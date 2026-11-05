# Broker / reconciliation contract (minimal, prepare-only)

## Permission boundaries

| Actor | May write holds/grants | May submit provider mutate | May read provider state |
| --- | --- | --- | --- |
| Human (future attestation) | via broker API only | no | no |
| Promotion broker | yes (CAS store) | yes (broker-held creds) | yes |
| CI workers / cloud agents | no | **no** | via broker readback API only |

Workers cannot write release state or call AWS/GitHub mutators directly in the target design. **Human approval attestation is unimplemented** — HMAC test fixture only.

## Operation states

`authorized` → `claimed` → `submitting` → (`accepted` | `unknown` | `failed`) → (`succeeded` | `failed` via readback)

- **One** non-idempotent provider `submit` per `operationId`.
- Unknown/accepted → reconcile with **readback only** (no blind resubmit).
- Immutable `operationId` = `op:{grantId}:{idempotencyKey}`.

## Holds vs operations (linearization)

See `HOLD_OPERATION_LINEARIZATION` in `reconciliation-broker.ts`. Holds never auto-expire. Hold after provider accept does not revoke in-flight provider work (honest limit).

## Unresolved operations vs new grants

Same logical promotion key with a non-terminal operation blocks opening a **different** grant — new grant cannot duplicate unresolved work.

## CAS / audit

`transactConsumeWithAudit` must be atomic (consume + audit + operation row) or fail with no partial consume visible. Memory implementation uses a mutex; production needs DynamoDB transact writes.

## Sandbox vs production

`FakePromotionProvider` + `MemoryPromotionCasStore` prove **local state-machine contract only**. They do **not** prove distributed CAS or live AWS/GitHub behavior.

## Integration surfaces (unchanged in this draft)

Listed in `scripts/release-control/integration-map.ts`.

## Go / no-go

**Sandbox contract:** GO for continuing draft iteration on this branch.  
**Real integration:** NO-GO until human attestation, DynamoDB transact, provider readback wiring, and credential narrowing are designed and demo'd — **no infra approval requested or assumed**.
