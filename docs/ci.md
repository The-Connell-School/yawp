# CI layout

`CI` runs on pull requests to `main`, on GitHub's standard runners.

- `Changed paths` decides what runs. Docs-only changes skip the heavy steps, and every check still reports.
- `🧪 E2E smoke (shard N)` splits the Playwright smoke specs across 6 runners, each with its own Postgres.
- `🔐 Sign-on browser flows` and `🧪 Demo feedback + preview access browser checks` run in parallel with the smoke shards.
- `🧪 E2E Tests (Playwright)` is the aggregate check. It fails if any E2E job failed.
- `📊 Merge E2E smoke reports` uploads one HTML report (`playwright-report-<run id>`).

Reproduce one shard locally: `bun run test:e2e:smoke --shard=2/6` in `services/web-app`.

Shard balance: Playwright splits by test count, keeping each spec file together, so shards are uneven (one large lesson-planner spec). Rebalancing is a possible follow-up.
