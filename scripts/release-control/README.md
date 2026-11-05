# Release control (prepare-only)

Scoped holds, artifact-bound grants, and **reconciliation broker** sandbox. See:

- `docs/design/release-control/ARCHITECTURE.md`
- `docs/design/release-control/RECONCILIATION.md`

```bash
bun test ./scripts/release-control/
```

Standalone tests only — not coupled to `deployment-contract.test.ts`.  
**Not enforced** in GitHub/AWS on this draft.
