# PR Preview Environments

PR preview environments replace per-PR App Runner services with one long-lived EC2 host that runs one Docker Compose project per pull request.

The target behavior is:

- Every same-repository PR deploys automatically on `opened`, `synchronize`, `reopened`, and `labeled`.
- Closed PRs are destroyed automatically with `docker compose down -v`, and stale previews are swept by the scheduled cleanup workflow.
- Open previews sleep after 48 hours without PR or preview-URL activity. Sleep uses `docker compose stop`, preserving containers, database, volumes, source, and access codes.
- Opening a sleeping preview with its one-click URL or an already authorized browser wakes that same Compose project automatically. The first request can take up to a minute while the app becomes healthy; no manual workflow or rebuild is required.
- Traefik records URL activity asynchronously, so a wake-service outage cannot take already-running previews offline. The bounded access log is truncated after 50 MiB.
- Each PR gets its own app container and database inside the shared preview Postgres container.
- The shared template database restores the configured preview-safe database dump from S3 once; new PR databases clone that template, then apply newer Prisma migrations.
- Deploys avoid ECR pushes and Terraform applies on the hot path.
- The preview URL is `https://pr-<number>.$PREVIEW_DOMAIN` when TLS is enabled.
- The React Router app protects every loader, action, and API route with a signed-cookie access gate. `/api/healthcheck` is the only exception. Deploys generate a memorable code and fail closed if no code reaches the app.
- The default runtime is `PREVIEW_RUNTIME=fast`: source is bind-mounted, Bun dependencies live in Docker volumes, React Router runs in dev mode, and warm deploys skip dependency install, Prisma generate, and migration work when the tooling fingerprint has not changed. The web container is still recreated after each source sync so the dev server starts from a clean process. Set `PREVIEW_RUNTIME=production` to use the production Dockerfile build path.

## Host Setup

Provision an EC2 instance with enough CPU and disk for concurrent Docker builds. Start with at least `t3.large` or `c7i.large` and 120 GB gp3. The first host can live in the default VPC because the app stack is self-contained.

Attach an IAM instance profile that can read the configured production dump object and publish aggregate host metrics. Scope dump access to `s3:GetObject` on `arn:aws:s3:::yawp-preview-videos/production.dump` plus `s3:GetBucketLocation` and prefix-scoped `s3:ListBucket` on the bucket. Its separate metrics policy should allow `cloudwatch:PutMetricData` only for the `Yawp/PreviewHost` namespace. The deploy script restores through the host AWS CLI when the shared template database does not exist. Preview app containers set `AWS_EC2_METADATA_DISABLED=true`, and host bootstrap adds Docker egress blocks for EC2 metadata addresses so app code cannot borrow the host role.

Open inbound ports:

- `22` from GitHub Actions egress or the office/VPN range used for operations.
- `80` and `443` from the internet for Traefik.

Then run:

```bash
PREVIEW_ROOT=/srv/yawp-preview \
PREVIEW_DOMAIN=preview.yawp.school \
PREVIEW_MAX_RUNNING=4 \
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
- Variable `PREVIEW_MAX_RUNNING` (defaults to `8`; memory limit)
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

Seat seeding is create-only. An existing organization ID is a strict no-op: no rename, upsert, fixture repair, or missing-row top-up occurs. A new seat is created with its complete template inside one transaction and class insights are enabled for that newly created organization. Normal demo and preview redeploys preserve the database; only the demo workflow's explicit `reset_data=true` input drops and reseeds it.

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

The hot path deliberately keeps state on the host: Docker layer cache, Bun dependency volumes, the shared restored template database, and PR-scoped Postgres databases. The first build on a cold host is slower because it creates the shared Postgres container and restores the production dump. Subsequent PR creates clone the template database locally, and warm PR updates skip tooling work when package, Prisma, and migration inputs are unchanged. In `fast` runtime, the web container still restarts by default; the speedup comes from removing package install, Prisma generate, migration, dump restore, and cloud control-plane work from the warm path.

Scheduled reconciliation runs every six hours. It destroys closed PR environments, sleeps open previews after their idle lease, and enforces separate resident and running caps. Successful non-health traffic intentionally updates the activity lease; HEAD, healthcheck, and error responses do not. The resident cap (20), running cap (4), Traefik rate limit (2 requests/minute with burst 3), and wake concurrency limit (2) bound resource use. A sleeping preview wakes automatically when the request carries either its one-click `code` or a valid signed access cookie from an earlier visit. Bare anonymous requests remain asleep and receive `401`, preventing bots and public probes from churning host memory. An authorized wake at the running cap may sleep the least recently used unpinned preview first. `preview:keep-awake` excludes a PR from sleep. Only resident-cap eviction or PR closure deletes preview-local state.

The host-bootstrap workflow runs only when dispatched from the default branch and checks out that dispatch's immutable commit SHA. It cannot execute an arbitrary PR ref with shared-host credentials.

### Sleep/wake rollout and rollback

Keep `PREVIEW_SLEEP_ENABLED=false` during the cutover. Merge the reviewed code, run the default-branch host-bootstrap workflow, and verify `yawp-preview-wake.service` plus the Traefik fallback before enabling sleep. The bootstrap copies that switch into the wake service, so dispatch bootstrap after changing it when a rollback must also disable wake-triggered displacement. Use a disposable seeded PR preview as the canary: preserve its access code and a state marker, stop it, open its URL, wait for health, then confirm the same Compose project and state returned. Set both idle variables to `48` and enable sleeping only after that canary passes.

For rollback, record the currently running PR set, set `PREVIEW_SLEEP_ENABLED=false`, and dispatch the default-branch host-bootstrap workflow so both reconciliation and wake displacement honor the switch. Do not start every resident project. Restore only the recorded or explicitly selected projects, one at a time, while keeping the running count at or below `PREVIEW_MAX_RUNNING`; verify health after each start. If the required set exceeds the cap, keep the least-recently-used projects stopped and escalate to a host resize rather than overcommitting memory. Already-running preview routes never depend on the wake service, so disabling or removing the fallback does not interrupt them.

Run `scripts/preview/prove-wake.sh` for a disposable real-Compose proof. It creates an isolated fixture project, stops it, wakes it through the production wake script, and verifies the container identity, state marker, and fixture access-code hash are unchanged before cleaning itself up.

Run `AWS_PROFILE=yawp scripts/preview/verify-host-alarms.sh` after preview-host changes. It fails unless disk warning, memory warning, and memory critical all retain matching non-empty `AlarmActions` and `OKActions`, preserving the recovery email paired with each alarm.
