# Release control (prepare-only)

Library prototype for **scoped holds** and **artifact-bound promotion grants**. See `docs/design/release-control/ARCHITECTURE.md`.

```bash
bun test ./scripts/release-control/promotion-control.test.ts ./scripts/release-control/concurrency.test.ts
```

**Not enforced** in GitHub/AWS until broker + table are provisioned and workflows opt in.
