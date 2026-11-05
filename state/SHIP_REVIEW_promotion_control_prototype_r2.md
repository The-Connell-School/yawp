# Independent Ship Review r2 — promotion control prototype (prepare-only)

**Verdict:** **SHIP for continued draft** — local contract hardened; **not** production enforcement.

## Delta from r1

- Holds: indefinite until explicit `clearHold`; regression for +10y wall clock
- `prepare_only` vs `live` enforcement modes (no fail-open when switching to live)
- Grant binding: env + repo + operation + commit + mandatory digest for `prod_deploy`
- Consume replay: `providerMutationPermitted` only on first consume; `hold_blocks_replay`
- Approval: generation + binding + expiry validated; HMAC fixture disclaimer
- Sandbox broker + fake provider tests (ordering only)
- CI: removed standalone `ci.yml` test list edit; wired via `deployment-contract.test.ts`

## Test evidence (simulated)

```text
bun test ./scripts/release-control/
25 pass, 0 fail
```

## Remaining gaps (do not claim enforced)

- Multi-process / DynamoDB CAS  
- GitHub merge gate live read  
- Provider reconciliation after failed mutate  
- Human approval integration (HMAC is fixture only)  
- AWS/GitHub demo  

## Production safety

No merge/deploy/infra/policy/permission changes. PR #917 untouched. Production paused.
