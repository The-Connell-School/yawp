# Release control (prepare-only)

Library prototype for **scoped holds** and **artifact-bound promotion grants**. See `docs/design/release-control/ARCHITECTURE.md`.

```bash
bun test ./scripts/release-control/
```

Also invoked from `scripts/deployment-contract.test.ts` (prepare-only contract hook).

**Not enforced** in GitHub/AWS until broker + table are provisioned and workflows opt in.
