# E2E Testing (Playwright)

These tests run against a real Postgres database and the real web app server.

## Setup model

- Schema setup uses Prisma migrations from `packages/prisma/migrations` via `prisma migrate deploy`.
- Fixture setup uses deterministic E2E seed logic in `seed-e2e.ts`.
- The bootstrap entrypoint is `prepare-e2e.ts` and is invoked by `ensure-e2e-env.ts` before the Playwright web server starts.
- Test context is written to `.e2e-context.json` and consumed by custom fixtures.

## Commands

```bash
# Prepare DB + env + seeded context (normally called by Playwright webServer setup)
bun run test:e2e:prepare

# Required smoke suite (chromium, auth + editor critical flows)
bun run test:e2e:smoke

# Default E2E command (smoke)
bun run test:e2e

# Full Playwright suite/projects
bun run test:e2e:full

# Interactive/debug helpers
bun run test:e2e:ui
bun run test:e2e:debug
```

## CI expectations

- CI should provide `DATABASE_URL` (Postgres service container).
- E2E setup does not copy Prisma schema files.
- Local runs can auto-start a Docker Postgres container (`yawp-e2e-postgres`) when `DATABASE_URL` is not provided.

## Authoring guidance

- Prefer deterministic fixtures over random shared state.
- Keep smoke tests focused on merge-gating user journeys.
- Add broader coverage in `test:e2e:full` without destabilizing smoke checks.
