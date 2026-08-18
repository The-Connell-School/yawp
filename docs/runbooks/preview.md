# PR Preview Environments

PR preview environments replace per-PR App Runner services with one long-lived EC2 host that runs one Docker Compose project per pull request.

The target behavior is:

- Every same-repository PR deploys automatically on `opened`, `synchronize`, `reopened`, and `labeled`.
- Closed PRs are destroyed automatically with `docker compose down -v`, and stale previews are swept by the scheduled cleanup workflow.
- Open previews sleep after 48 hours without PR or authorized preview-URL activity. Sleep uses `docker compose stop`, preserving containers, database, volumes, source, and access codes.
- Opening a sleeping preview with its one-click URL or an already authorized browser wakes that same Compose project automatically. The first request can take up to a minute while the app becomes healthy; no manual workflow or rebuild is required.
- The app adds a non-secret response marker only after validating the signed preview seat. Traefik retains only that response header and records authorized URL activity asynchronously, so anonymous redirects, the access screen, stale cookies, and static assets cannot renew leases. A wake-service outage cannot take already-running previews offline. The bounded access log is truncated after 50 MiB.
- Each PR gets its own app container and database inside the shared preview Postgres container.
- The shared template database restores the configured preview-safe database dump from S3 once; new PR databases clone that template, then apply newer Prisma migrations.
- Deploys avoid ECR pushes and Terraform applies on the hot path.
- The preview URL is `https://pr-<number>.$PREVIEW_DOMAIN` when TLS is enabled.
- The React Router app protects every loader, action, and API route with a signed-cookie access gate. `/api/healthcheck` is the only exception. Deploys generate a memorable code and fail closed if no code reaches the app.
- Live Anthropic AI is enabled in every access-gated PR preview. Deploys fail closed when neither `PREVIEW_ANTHROPIC_API_KEY` nor `ANTHROPIC_API_KEY` is configured for the preview-host environment.
- The default runtime is `PREVIEW_RUNTIME=fast`: source is bind-mounted, identical dependency graphs share immutable content-addressed Docker volumes, React Router runs in dev mode, and warm deploys skip dependency install, Prisma generate, and migration work when the tooling fingerprint has not changed. Vite and React Router write only to per-preview scratch volumes. The web container is still recreated after each source sync so the dev server starts from a clean process. Set `PREVIEW_RUNTIME=production` to use the production Dockerfile build path, or add `preview:production-runtime` to canary that path on one PR.

## Host Setup

Provision an EC2 instance with enough CPU and disk for concurrent Docker builds. Start with at least `t3.large` or `c7i.large` and 120 GB gp3. The first host can live in the default VPC because the app stack is self-contained.

Attach an IAM instance profile that can read the configured production dump object and publish aggregate host metrics. Scope dump access to `s3:GetObject` on `arn:aws:s3:::yawp-preview-videos/production.dump` plus `s3:GetBucketLocation` on the bucket. The demo host additionally needs `s3:PutObject` on `arn:aws:s3:::yawp-preview-videos/demo-backups/*` and `s3:GetBucketVersioning` on the bucket. Do not grant the demo host `s3:DeleteObject` or `s3:DeleteObjectVersion`; off-host retention belongs to a bucket lifecycle or Object Lock policy controlled by a separate administrative principal. After this control plane lands, dispatch `Demo backup IAM guard` once from `main`. It discovers the EC2 instance role from `DEMO_HOST`, or provisions and attaches the dedicated `yawp-demo` profile when none exists, installs the least-privilege backup access policy plus an explicit deny for both deletion actions on the backup prefix, and fails unless IAM simulation proves both decisions are `explicitDeny`. Its separate metrics statement allows `cloudwatch:PutMetricData` only for the `Yawp/PreviewHost` namespace. The deploy script restores through the host AWS CLI when the shared template database does not exist. Preview app containers set `AWS_EC2_METADATA_DISABLED=true`, and host bootstrap adds Docker egress blocks for EC2 metadata addresses so app code cannot borrow the host role.

Open inbound ports:

- `22` from GitHub Actions egress or the office/VPN range used for operations.
- `80` and `443` from the internet for Traefik.

Then run:

```bash
PREVIEW_ROOT=/srv/yawp-preview \
PREVIEW_DOMAIN=preview.yawp.school \
PREVIEW_MAX_RUNNING=8 \
PREVIEW_ACME_EMAIL=ops@yawp.school \
bash scripts/preview/bootstrap-host.sh
```

Point `*.preview.yawp.school` or the chosen wildcard domain at the host public IP.

For a temporary IP-based smoke host, use the dashed `sslip.io` form and disable TLS:

```bash
PREVIEW_DOMAIN=54-243-7-236.sslip.io
PREVIEW_TLS=false
```

## GitHub Configuration

Create an SSH deploy key for the host user and save the private key in GitHub:

```bash
PREVIEW_HOST=<host-or-ip> \
PREVIEW_DOMAIN=preview.yawp.school \
PREVIEW_SSH_USER=ec2-user \
PREVIEW_SSH_PRIVATE_KEY="$(cat ~/.ssh/yawp-preview)" \
./scripts/github-preview-config.sh
```

Required repository settings:

- Variable `PREVIEW_HOST`
- Variable `PREVIEW_DOMAIN`
- Variable `PREVIEW_ROOT`
- Variable `PREVIEW_SSH_USER`
- Variable `PREVIEW_TLS`
- Variable `PREVIEW_RUNTIME`
- Variable `PREVIEW_MAX_RESIDENT` (defaults to `20`; disk/state limit)
- Variable `PREVIEW_MAX_RUNNING` (defaults to `4`; memory limit)
- Variable `PREVIEW_DEPENDENCY_CACHE_GRACE_HOURS` (defaults to `168`; unused-cache rollback window)
- Variable `PREVIEW_SLEEP_ENABLED` (`true` enables idle sleeping)
- Variables `PREVIEW_DRAFT_IDLE_HOURS` and `PREVIEW_READY_IDLE_HOURS` (both default to `48`)
- Variable `PREVIEW_SEAT_COUNT` (optional; defaults to `6`)
- Variable `PREVIEW_AI_MODEL`
- Variable `PREVIEW_DB_DUMP_S3_URI`
- Variable `PREVIEW_SANITIZED_DUMP_VERSION` when using sanitized production rehearsals
- Secret `PREVIEW_SSH_PRIVATE_KEY`
- Secret `PREVIEW_ANTHROPIC_API_KEY` or repository secret `ANTHROPIC_API_KEY`
- Secret `PREVIEW_DB_PASSWORD` if the shared preview Postgres password is not the default
- Secret `PREVIEW_LOGIN_EMAIL`
- Secret `PREVIEW_LOGIN_PASSWORD`

### Retrieve or add seat access codes

On the first deploy, `scripts/preview/deploy.sh` creates six isolated seats and generates one memorable code per seat from curated adjective and animal lists. Seat 1 is Brian Connell's adopted `local-dev-org`; seat 2 is Bryant Brock's; seats 3–6 are generic. The deploy retains the code-to-organization map across redeploys and prints every code in the job log:

```text
PREVIEW_ACCESS_CODE=brave-otter-4193
PREVIEW_SEAT_CODE_1=brave-otter-4193
Preview seat 1 (Brian Connell): brave-otter-4193
PREVIEW_SEAT_CODE_2=calm-panda-8127
Preview seat 2 (Bryant Brock): calm-panda-8127
```

`PREVIEW_ACCESS_CODE` remains the seat-1 value used by smoke verification. Entering any seat code both authenticates the visitor and binds the signed cookie to that seat's organization. The access session is an `HttpOnly`, `SameSite=Lax` cookie with a 30-day lifetime.

The deploy stores independent random secrets for the application session and preview gate. The app receives them as `SESSION_SECRET` and `PREVIEW_ACCESS_SECRET`; the gate fails closed if its dedicated secret or seat map is absent. Neither secret is printed. Do not reuse the session secret for the gate.

Set the repository variable `PREVIEW_SEAT_COUNT` (default `6`) to add seat N+1 in PR preview environments. For the persistent demo environment, set the environment variable `DEMO_SEAT_COUNT` instead. The retained map is only topped up and a lower configured count never removes a seat, so codes and databases for seats 1…N remain unchanged. To supply an operator-controlled map, set `PREVIEW_ACCESS_SEATS` to a JSON array of `{ "code", "organizationId", "label" }` objects. `PREVIEW_ACCESS_CODES` remains a Phase 1 migration input: a retained single code is adopted as seat 1 when the seat map is first created.

Seat seeding is create-only. An existing organization ID is a strict no-op: no rename, upsert, fixture repair, or missing-row top-up occurs. A new seat is created with its complete template inside one transaction and class insights are enabled for that newly created organization. Normal demo and preview redeploys preserve the database. A destructive demo reset requires both `reset_data=true` and the exact typed confirmation `RESET yawp_demo`; the deploy builds the requested images first, creates and restore-validates a `pre-reset` dump, and successfully copies that recovery point off-host before it can drop the database. The existing web container is not removed during the reset. Any later migration, seed, or rollout failure automatically restores the verified pre-reset dump and re-hardens its database role.

The `Demo database backup` GitHub workflow runs every day at 03:17 UTC and shares the demo-deploy concurrency lock, so deploys and backups cannot overlap. It invokes rollback-stable backup and publisher tools under `${PREVIEW_ROOT}/ops`; the publisher uses the host instance role instead of long-lived GitHub AWS keys, requires S3 bucket versioning, verifies the checksum, applies AES-256 server-side encryption, and copies scheduled and pre-reset recovery points to `s3://yawp-preview-videos/demo-backups`. The workflow retains 14 scheduled copies locally by default. Its `backup_retention` input or `DEMO_BACKUP_RETENTION` variable can set the local count from 1 through 365; leading zeroes are rejected. The host has no S3 deletion rights, so an instance compromise cannot erase off-host recovery points. Configure off-host expiration through a version-aware bucket lifecycle or Object Lock policy under a separate administrative principal. Scheduled and pre-reset dumps rotate independently on-host, so one reset cannot evict the daily recovery set. Each dump is restored into a temporary database with `pg_restore --exit-on-error` before atomic publication and receives a portable `.sha256` sidecar. Local copies live under `${PREVIEW_ROOT}/backups`.

Demo deploys separate application source from deployment control. The requested ref is synced only as `SOURCE_DIR`; the script that can back up, migrate, or reset the database is always checked out from the reviewed default branch and synced to `${PREVIEW_ROOT}/control/demo`. Rollbacks therefore cannot reintroduce an older destructive deploy implementation. Optional fixture-sync, release-gate, backfill, and preview-seat commands are feature-detected in the application ref so a reviewed historical release can still roll back without containing today’s tooling.

Production-mode demo deploys use a health-gated two-container rollout. The existing web container keeps serving while a second container starts from the new image. The candidate must pass its own Docker healthcheck and login smoke before an atomic Traefik route update; public health and login are checked again before and after the prior container stops. Any failure restores the previous route and restarts the prior container. A successful rollout retains that stopped container until the next deployment so an operator still has the immediately previous image available for rollback.

The access screen is the only application page reachable without an in-app access cookie. Loaders without that cookie redirect there, while actions and `/api/*` requests without it return `401`; `/api/healthcheck` remains outside the in-app gate. The deploy smoke explicitly checks that `POST /auth/dev-login` is blocked before using the code.

### In-app access gate

The signed-cookie access gate in the app is the preview and demo host's only access gate. Deploy tooling and workflow self-verification make anonymous requests to prove the access screen renders and that `POST /auth/dev-login` returns `401` without a code. They then submit a valid access code and verify it establishes the signed access cookie before continuing with login checks.

### Sanitized production rehearsal

Add the `sanitized-production-data` label to an internal PR to replace its seed database with the current scrubbed production snapshot. This mode is deliberately separate from raw `production-dump` mode: it keeps the in-app access gate and enables the dev-login role switcher only after the gate cookie is established.

Refresh the snapshot with the fail-closed orchestration command:

```bash
bun run db:refresh-sanitized-preview-data --dry-run
bun run db:refresh-sanitized-preview-data --yes
```

The command reads production access from the ignored `scripts/production-sync.env` by default. Start from `scripts/production-sync.env.example`; configure the bastion and database values, `AWS_PROFILE`, `PREVIEW_DB_DUMP_S3_URI`, and `YAWP_GITHUB_REPOSITORY`. If `YAWP_PROD_BASTION_INSTANCE_ID` is configured, the command starts the instance only when it was stopped, discovers its current public IP, and stops it again during cleanup. `--env-file PATH` selects another ignored configuration file. Trusted non-interactive automation may use `YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH=yes` instead of `--yes`.

The refresh runs a temporary Postgres 17 container and streams `pg_dump` from the production bastion directly into it. It never writes the raw production dump to disk. It then runs `packages/prisma/scripts/sanitize-preview-production-data.ts` against that localhost-only database, requires the sanitizer's count and fingerprint parity report, creates a compressed dump only after sanitization succeeds, streams its scrubbed plain SQL to the configured S3 object, verifies the object is readable, and updates the repository variable `PREVIEW_SANITIZED_DUMP_VERSION`. A trap removes the temporary container, sanitized dump, report, SSH host-key file, and working directory on success, failure, or interruption. A bastion started by the command is also stopped; a bastion that was already running is left running.

The sanitizer deterministically replaces:

- Every `User.name` and `User.email`, while reserving `dev.admin@yawp.local`, `dev.teacher@yawp.local`, and `dev.student@yawp.local` inside `default-org`.
- Legacy `schoolTeacher` display values in membership and forensic tables.
- Email-shaped invitation targets.

The sanitizer aborts unless all public-table row counts, user/membership/class IDs, and complete `Document` rows are unchanged. The orchestration command cannot reach S3 until that check succeeds. Never upload an unsanitized dump to the preview object manually.

The deploy uses the published version in its template name and replaces any existing PR database when the mode, object URI, or version changes. Refreshing the snapshot does not itself redeploy an open PR; rerun its preview workflow or synchronize the PR after the command completes.

Removing the label is intentionally not an automatic deployment event. Close the rehearsal PR when finished; its environment and PR database will be destroyed by the normal preview cleanup path.

## Local Smoke

Run the same preview deployment path locally with a direct port. It intentionally keeps the access-gate requirement because it exercises preview publishing; ordinary non-preview local Compose and `bun dev` workflows are unchanged.

```bash
PR_NUMBER=999 \
PREVIEW_DOMAIN=localhost \
PREVIEW_ROOT=/tmp/yawp-preview \
PREVIEW_DIRECT_PORT=18080 \
bash scripts/preview/deploy.sh
```

The command prints `PREVIEW_ACCESS_CODE=...` plus every seat-labelled code after the health, access-gate, and login smoke checks pass. To use fixed local codes, provide `PREVIEW_ACCESS_SEATS` as described above. Direct-port local smoke uses the same anonymous transport as deployed self-verification.

Destroy it with:

```bash
PR_NUMBER=999 \
PREVIEW_DOMAIN=localhost \
PREVIEW_ROOT=/tmp/yawp-preview \
bash scripts/preview/destroy.sh
```

Production-dump app-login smoke credentials come from `PREVIEW_LOGIN_EMAIL` and `PREVIEW_LOGIN_PASSWORD`. Seeded and sanitized-production fast previews use the dev-login route only after the in-app access code has established the gate cookie. `PREVIEW_DATA_MODE=production-dump` continues to disable role-swap regardless of gate state.

## Performance Notes

The hot path deliberately keeps state on the host: Docker layer cache, content-addressed Bun dependency volumes, the shared restored template database, and PR-scoped Postgres databases. The dependency fingerprint covers the Bun image, lockfile, root manifest, and every workspace manifest. Two PRs with the same fingerprint mount the same root and web dependency volumes read-only. A changed lockfile or manifest creates a different cache automatically. Failed installs never receive a readiness marker and are removed before retry. Scheduled reconciliation removes only correctly labeled, unreferenced caches older than `PREVIEW_DEPENDENCY_CACHE_GRACE_HOURS`; Docker still refuses removal if a cache is mounted. Production images carry a dedicated label: PR teardown removes the exact project tag, while scheduled cleanup prunes only labeled, dangling images older than the same grace period.

Runtime configuration remains isolated per Compose project. Database credentials, access seats, session secrets, AI keys, data mode, and other environment values do not enter dependency identity and may differ between any two PRs without splitting or mutating the shared cache. Production Docker dependency layers likewise receive only package manifests; `DATABASE_URL` enters after dependency installation. Future variables that affect a client build must remain in the per-PR tooling/build stages, never the dependency stage. Ordinary runtime-only variables belong in the container environment.

The first build on a cold host is slower because it installs one dependency graph, creates the shared Postgres container, and may restore the production dump. Subsequent PR creates clone the template database locally, and warm PR updates skip tooling work when package, Prisma, and migration inputs are unchanged. In `fast` runtime, the web container still restarts by default; the speedup comes from removing package install, Prisma generate, migration, dump restore, and cloud control-plane work from the warm path. In `production` runtime, application source changes preserve the large dependency layer and rebuild only tooling, application bundles, and the thin per-PR image layers.

### Measured t3.large capacity

Measurements on the x86 preview host on 2026-08-18 showed fast-runtime containers at 459–603 MiB each. PR 241 used 488 MiB. The same source in the production runtime used 246 MiB idle and 301 MiB after 200 health requests. The host has 7.64 GiB RAM, 4 GiB swap, and roughly 1.8–2.0 GiB of non-preview working memory under the measured workload.

- Keep `PREVIEW_MAX_RUNNING=8` while fast runtime remains the default.
- Canary production runtime with `preview:production-runtime`. After at least one week without memory alarms, set production as the default and raise the running cap to `12`.
- Treat `14` as the probable hard ceiling on this t3.large after representative page and AI load testing. Do not set `16`: the arithmetic fits only by consuming operating-system, build, and burst headroom.
- Keep Docker builds serialized. Build memory and CPU are transient but materially larger than the steady application process.

Rollback is label/config-only: remove `preview:production-runtime` from a canary or set repository variable `PREVIEW_RUNTIME=fast`, then redeploy. Dependency caches and PR databases remain compatible across both runtimes.

Scheduled reconciliation runs every six hours. It destroys closed PR environments, sleeps open previews after their idle lease, garbage-collects aged unreferenced dependency caches, and enforces separate resident and running caps. Only traffic whose app response carries the non-secret authorization marker updates the activity lease; HEAD, healthcheck, anonymous redirect, access-screen, static-asset, stale-cookie, and error traffic do not. The resident cap (20), current t3.large running cap (8), Traefik rate limit (2 requests/minute with burst 3), and wake concurrency limit (2) bound resource use. A sleeping preview wakes automatically when the request carries either its one-click `code` or a valid signed access cookie from an earlier visit. Bare anonymous requests remain asleep and receive `401`, preventing bots and public probes from churning host memory. An authorized wake at the running cap may sleep the least recently used unpinned preview first. `preview:keep-awake` excludes a PR from sleep. Only resident-cap eviction or PR closure deletes preview-local state.

The host-bootstrap workflow runs only when dispatched from the default branch and checks out that dispatch's immutable commit SHA. It cannot execute an arbitrary PR ref with shared-host credentials.

### Sleep/wake rollout and rollback

Keep `PREVIEW_SLEEP_ENABLED=false` during the cutover. Merge the reviewed code, run the default-branch host-bootstrap workflow, and verify `yawp-preview-wake.service` plus the Traefik fallback before enabling sleep. The bootstrap copies that switch into the wake service, so dispatch bootstrap after changing it when a rollback must also disable wake-triggered displacement. Use a disposable seeded PR preview as the canary: preserve its access code and a state marker, stop it, open its URL, wait for health, then confirm the same Compose project and state returned. Set both idle variables to `48` and enable sleeping only after that canary passes.

For rollback, record the currently running PR set, set `PREVIEW_SLEEP_ENABLED=false`, and dispatch the default-branch host-bootstrap workflow so both reconciliation and wake displacement honor the switch. Do not start every resident project. Restore only the recorded or explicitly selected projects, one at a time, while keeping the running count at or below `PREVIEW_MAX_RUNNING`; verify health after each start. If the required set exceeds the cap, keep the least-recently-used projects stopped and escalate to a host resize rather than overcommitting memory. Already-running preview routes never depend on the wake service, so disabling or removing the fallback does not interrupt them.

Run `scripts/preview/prove-wake.sh` for a disposable real-Compose proof. It creates an isolated fixture project, stops it, wakes it through the production wake script, and verifies the container identity, state marker, and fixture access-code hash are unchanged before cleaning itself up.

Run `AWS_PROFILE=yawp scripts/preview/verify-host-alarms.sh` after preview-host changes. It fails unless disk warning, memory warning, and memory critical all retain matching non-empty `AlarmActions` and `OKActions`, preserving the recovery email paired with each alarm.
