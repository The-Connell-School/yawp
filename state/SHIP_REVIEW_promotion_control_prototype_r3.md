# Ship Review r3 — reconciliation broker contract (prepare-only)

**Verdict:** **GO** for sandbox/local contract on draft #918. **NO-GO** for real integration.

## Added

- Operation state machine + `DurablePromotionCasStore` / `MemoryPromotionCasStore`
- `ReconciliationBroker`: open → claim → submit → readback reconcile
- Fake provider scenarios (reject before accept, timeout after accept, crash/replay, holds)
- `integration-map.ts` (read-only surfaces; unchanged in prod)
- Removed deployment-contract test hook; consolidated tests (`operation-machine.test.ts`)

## Tests (sandbox — not distributed)

```text
bun test ./scripts/release-control/
```

## Go / no-go

| Gate | Result |
| --- | --- |
| Sandbox contract complete enough to iterate | **GO** |
| DynamoDB / live GitHub / AWS enforcement | **NO-GO** |
| Human approval attestation | **NO-GO** (HMAC fixture only) |
| Infra apply | **Not requested; none granted** |

## Production safety

Draft only. Production pause unchanged. No merge/deploy/infra/policy/permission edits. PR #917 untouched.
