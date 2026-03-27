# PR preview environments — portable reference & replication prompt

Use this from **any machine** by referencing the **absolute paths** below (repo: `yawp-2.0` on disk). Copy the **§ Replication prompt** block into another repo’s AI session to reproduce the same pattern.

---

## What we built

- **One shared Postgres (RDS)** holds **many PR schemas** named `pr_<PR_NUMBER>` (e.g. `pr_42`). No per-PR database.
- **GitHub Actions** on `pull_request` (opened/sync/reopened): create schema → restore **production SQL dump** from S3 with **sed remapping** `public` → `pr_N` → `prisma migrate deploy` → **seed overlay** (known test users) → **Docker build** → **push ECR** → **Terraform** provisions **AWS App Runner** per PR → **health wait** → **Playwright smoke** → **sticky PR comment** with URL.
- On **PR close**: **Terraform destroy** for that PR’s state key (App Runner + related infra for that env).
- **Skip previews**: put `[skip preview]` in PR **title**, **body**, or **head branch name**.

Canonical workflow file:

`/Users/bryantbrock/brocksoftware/yawp-2.0/.github/workflows/preview-environments.yml`

Secondary CI (typecheck, e2e on PR to `main`, production deploy) — not the preview pipeline:

`/Users/bryantbrock/brocksoftware/yawp-2.0/.github/workflows/deploy.yml`

---

## Workflow shape (jobs)

| Job | When | Purpose |
|-----|------|---------|
| `preview-deploy` | PR opened/sync/reopened (not closed); same repo; not skipped | Full deploy + smoke |
| `preview-destroy` | PR closed; same conditions | `terraform destroy` for `pr-<N>` |

Concurrency: `preview-${{ github.event.pull_request.number }}` — one active run per PR, newer commits cancel the old one.

---

## AWS & GitHub configuration (one-time)

### OIDC + role

- Workflow uses `aws-actions/configure-aws-credentials` with **`secrets.AWS_ROLE_ARN`** (OIDC role allowed to assume from GitHub Actions).
- Script that pushes **repo variables** + **AWS_ROLE_ARN** secret (expects `gh` CLI + `aws` with profile `yawp`):

`/Users/bryantbrock/brocksoftware/yawp-2.0/scripts/github-preview-config.sh`

It sets variables such as: `PREVIEW_TF_STATE_BUCKET`, `PREVIEW_ECR_REPOSITORY`, `PREVIEW_DB_URL_SECRET_ARN`, many `PREVIEW_*_SECRET_ARN` for App Runner secrets, `PREVIEW_AWS_S3_BUCKET` (staging bucket for uploads — **not** production), `PREVIEW_RESEND_FROM_EMAIL`, `PREVIEW_AWS_REGION`, `PREVIEW_APP_NAME`.

### GitHub vars the workflow expects

See the `env:` block at the top of `preview-environments.yml` — all `PREVIEW_*` names are required unless you change the workflow. The **check** step fails fast if any are missing.

### Terraform for previews

- Directory: `/Users/bryantbrock/brocksoftware/yawp-2.0/infra-pr/`
- Backend: S3 bucket from `PREVIEW_TF_STATE_BUCKET`, key `yawp/pr/pr-<N>/terraform.tfstate`.
- Main resources: App Runner service from ECR image, IAM for Secrets Manager + S3 + SES, health check on `/api/healthcheck`.

Important variables:

- `TF_VAR_database_schema` = `pr_<N>` (must match what you loaded into Postgres).
- `TF_VAR_env` = `pr-<N>` (naming).
- `TF_VAR_web_app_image_identifier` = ECR URI with tag `pr-<N>`.

Terraform file defining runtime env:

`/Users/bryantbrock/brocksoftware/yawp-2.0/infra-pr/main.tf`

- Injects `DATABASE_SCHEMA` and `DATABASE_SSL_REQUIRE=true` as **non-secret** env vars.
- `DATABASE_URL` comes from **Secrets Manager** (shared base URL for the preview DB — **without** `schema=` in the secret; schema is applied at runtime).

---

## Database: per-PR schema + production dump

### Why a schema, not a new database

RDS connection limits and ops cost favor **one database, many schemas**. Prisma is pointed at the same DB with `?schema=pr_N` (and/or `DATABASE_SCHEMA` — see app layer below).

### Dump source

- Plain SQL from `pg_dump` stored in S3 (example key used in repo): `s3://yawp-production-database-exports/Mar03260636.dump`
- **Constant** duplicated in workflow and in local E2E prepare — change both when refreshing the dump.

### CI steps (restore + migrate + overlay)

In `preview-environments.yml`:

1. Load `BASE_DATABASE_URL` from Secrets Manager; **append `sslmode=require`** if missing (RDS).
2. `prisma db execute --stdin`: `CREATE SCHEMA IF NOT EXISTS pr_<N>;`
3. Build `MIGRATE_URL` = base URL + `&schema=pr_<N>` (or `?schema=` if no query string).
4. Stream: `aws s3 cp ... - | sed 's/public\./pr_N./g; s/search_path = public/search_path = pr_N/g' | psql "$MIGRATE_URL"`
5. `DATABASE_URL=$MIGRATE_URL prisma migrate deploy` — applies migrations newer than the dump; `_prisma_migrations` in the dump is remapped into `pr_N._prisma_migrations` by the same sed.
6. `bun run prisma:generate` from repo root.
7. Run overlay: `DATABASE_SSL_REJECT_UNAUTHORIZED=false DATABASE_URL="$MIGRATE_URL" bun run packages/prisma/scripts/seed-overlay.ts`  
   - Note: `NODE_TLS_REJECT_UNAUTHORIZED=0` is set on that step’s `env` for TLS edge cases in CI.
   - `DATABASE_SSL_REJECT_UNAUTHORIZED` is passed for symmetry with other tooling; the overlay script’s Prisma adapter already uses `rejectUnauthorized: false` for non-local connections when a schema URL is used — verify in file below.

Shared overlay (idempotent test users on top of prod data):

`/Users/bryantbrock/brocksoftware/yawp-2.0/packages/prisma/scripts/seed-overlay.ts`

### Sed / dump caveats

- **Pattern** targets `public.` and `search_path = public` in dump output — works for typical plain-SQL `pg_dump` DDL/COPY headers; unlikely to false-positive in COPY data rows.
- If dumps get weird, escalation path is **custom format** `pg_dump -Fc` + `pg_restore` with schema mapping instead of sed.
- **Sensitive data**: dump is real production data — team accepted risk; otherwise add sanitization at dump generation time.

---

## App runtime: schema + SSL (critical)

### Runtime env (App Runner)

From Terraform (`infra-pr/main.tf`): `DATABASE_SCHEMA=pr_N`, `DATABASE_SSL_REQUIRE=true`, base `DATABASE_URL` secret without schema.

### Web app DB client

`/Users/bryantbrock/brocksoftware/yawp-2.0/services/web-app/app/utils/db.server.ts`

- **`ensureDatabaseUrlIncludesSchemaQueryParam()`**: if `DATABASE_SCHEMA` is set and `DATABASE_URL` has no `schema=` query param, **append** `?schema=` / `&schema=` so Prisma’s namespace matches the loaded schema.
- **`pgPoolConfig()`**: for TLS to RDS, **`stripSslModeQuery()`** removes `sslmode` from the URL so the **`pg`** pool’s explicit `ssl: { rejectUnauthorized: false }` is not overridden by conflicting parsed SSL from the URL.
- **`options: -c search_path=pr_N`** when `DATABASE_SCHEMA` is set — aligns session search path with the Prisma adapter schema option.

Obstacles we hit conceptually:

- **Double SSL config**: URL `sslmode=require` + manual `ssl` object — strip query param and set SSL in one place.
- **Prisma + schema**: driver adapter needs both URL `schema=` and/or `PrismaPg(..., { schema })` — this codebase sets both paths for preview.

### Workflow SSL bits

- `NODE_TLS_REJECT_UNAUTHORIZED=0` on the **Create PR schema** step — relaxes Node TLS during `psql`/CLI if needed in the runner context.
- Base URL always gets `sslmode=require` for RDS in the **Load base database URL** step.

---

## Docker image build in CI

Preview build uses a **dummy** local URL for `DATABASE_URL` at build time (no real DB needed to compile):

`/Users/bryantbrock/brocksoftware/yawp-2.0/.github/workflows/preview-environments.yml`  
(step “Build and push image to ECR” — `postgresql://postgres:postgres@localhost:5432/preview_build`)

Real connection is **runtime** on App Runner via secrets.

---

## Post-deploy: health + smoke

1. `aws apprunner start-deployment` then wait loop on `GET /api/healthcheck` (up to ~10 minutes with 10s sleeps).
2. Install Playwright Chromium in `services/web-app`.
3. Run:

`/Users/bryantbrock/brocksoftware/yawp-2.0/services/web-app/scripts/smoke-pr-preview.mjs`

- Uses `PREVIEW_BASE_URL` set by the workflow; logs in as `teacher@fake.test` / `teacher123` (overlay users).
- `ignoreHTTPSErrors: true` on the browser context for App Runner HTTPS quirks.

(Comment at top of `smoke-pr-preview.mjs` still mentions `seed.ts` — data is now **dump + overlay**; PR comment text in the workflow is correct.)

---

## Parity: local / CI E2E with the same dump

Prepare script (Docker Postgres or `E2E_DATABASE_URL`, drop/create DB, S3 download once to cache, restore, migrate, overlay):

`/Users/bryantbrock/brocksoftware/yawp-2.0/services/web-app/e2e/prepare-e2e.ts`

- Dump cache: `/Users/bryantbrock/brocksoftware/yawp-2.0/services/web-app/e2e/.data/` (gitignored).
- **Gotcha**: when `CI=true`, only **`E2E_DATABASE_URL`** pins the DB — do not rely on `DATABASE_URL` alone for prepare (see comment in `prepareConnection`).

Design write-up (S3, sed, overlay, risks):

`/Users/bryantbrock/brocksoftware/yawp-2.0/docs/superpowers/specs/2026-03-26-production-dump-for-previews-and-e2e.md`

Implementation plan (checkbox tasks):

`/Users/bryantbrock/brocksoftware/yawp-2.0/docs/superpowers/plans/2026-03-26-production-dump-for-previews-and-e2e.md`

---

## Prisma schema locations

- Main app schema:

`/Users/bryantbrock/brocksoftware/yawp-2.0/packages/prisma/schema.prisma`

- E2E may reference a generated client path under `services/web-app/e2e/prisma/schema.prisma` — keep in sync with migrations when replicating.

---

## Obstacle checklist (short)

| Topic | What we did |
|-------|-------------|
| Isolation | `pr_<N>` schema; sed remap dump from `public` |
| Migrations after dump | `prisma migrate deploy` after restore |
| Prisma migration history | `_prisma_migrations` remapped with `public.` → `pr_N.` |
| App connects to right schema | `DATABASE_SCHEMA` + append `schema=` to URL in `db.server.ts` |
| RDS TLS | `sslmode=require` on URL + strip in pool + explicit `ssl: { rejectUnauthorized: false }` |
| CI seed/migrate TLS | `NODE_TLS_REJECT_UNAUTHORIZED`, overlay env vars |
| Secrets | Base DB URL in Secrets Manager; schema not in secret |
| Cost / cleanup | `preview-destroy` on PR close |
| Fork PRs | Workflow requires `head.repo.full_name == github.repository` (no preview from forks) |
| Skip | `[skip preview]` in title, body, or branch |

---

## § Replication prompt (paste into another repo)

```
Implement PR preview deployments mirroring this reference repository.

## Reference repo (read these absolute paths on disk)
Base: /Users/bryantbrock/brocksoftware/yawp-2.0/

### Core workflow
- /Users/bryantbrock/brocksoftware/yawp-2.0/.github/workflows/preview-environments.yml

### Infra (Terraform App Runner per PR)
- /Users/bryantbrock/brocksoftware/yawp-2.0/infra-pr/main.tf
- /Users/bryantbrock/brocksoftware/yawp-2.0/infra-pr/variables.tf
- /Users/bryantbrock/brocksoftware/yawp-2.0/infra-pr/outputs.tf
- /Users/bryantbrock/brocksoftware/yawp-2.0/infra-pr/backend.tf (if present)

### GitHub ↔ AWS variable sync helper
- /Users/bryantbrock/brocksoftware/yawp-2.0/scripts/github-preview-config.sh

### App database wiring (schema + SSL for RDS)
- /Users/bryantbrock/brocksoftware/yawp-2.0/services/web-app/app/utils/db.server.ts

### Data: production dump → S3; CI streams with sed; shared test overlay
- Spec: /Users/bryantbrock/brocksoftware/yawp-2.0/docs/superpowers/specs/2026-03-26-production-dump-for-previews-and-e2e.md
- Overlay script: /Users/bryantbrock/brocksoftware/yawp-2.0/packages/prisma/scripts/seed-overlay.ts
- Local E2E prepare (same dump path): /Users/bryantbrock/brocksoftware/yawp-2.0/services/web-app/e2e/prepare-e2e.ts

### Post-deploy verification
- /Users/bryantbrock/brocksoftware/yawp-2.0/services/web-app/scripts/smoke-pr-preview.mjs

## Required behavior
1. On PR open/sync/reopened: OIDC to AWS; load shared DATABASE_URL secret; ensure sslmode=require for RDS; CREATE SCHEMA pr_<N>; stream S3 pg_dump through sed replacing public. with pr_<N>. and search_path; psql to schema-qualified URL; prisma migrate deploy; run seed overlay with known test users; build Docker image with dummy DATABASE_URL; push to ECR; terraform apply infra-pr with TF_VAR_database_schema=pr_<N> and image tag pr-<N>; start App Runner deployment; wait for /api/healthcheck; run Playwright smoke; post sticky comment with URL, schema name, image, data source.
2. On PR close: terraform destroy with same state key pattern.
3. App Runner must set DATABASE_SCHEMA and DATABASE_SSL_REQUIRE; DATABASE_URL secret is base URL without schema; application must merge schema into URL before Prisma starts (see db.server.ts).
4. Handle RDS TLS by stripping sslmode from URL when passing explicit ssl to pg and use rejectUnauthorized: false if that matches your security model for previews.
5. Concurrency per PR; skip previews when [skip preview] in title, body, or head branch; do not run previews for fork PRs if you need secrets.
6. Adapt resource names, ARNs, S3 bucket for dumps, ECR repo, and Terraform backend bucket/key prefix to the new project.

Deliver: workflows, Terraform, app changes, documentation of secrets/vars, and a short runbook for refreshing the S3 dump constant.
```

---

*Generated as a portable handoff for preview-environment replication. Update S3 keys and account-specific ARNs when forking the pattern.*
