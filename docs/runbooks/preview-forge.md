# PR Preview Environments

PR preview environments replace per-PR App Runner services with one long-lived EC2 host that runs one Docker Compose project per pull request.

The target behavior is:

- Every same-repository PR deploys automatically on `opened`, `synchronize`, and `reopened`.
- Closed PRs are destroyed automatically with `docker compose down -v`, and stale previews are swept by the scheduled cleanup workflow.
- Each PR gets its own app container and database inside the shared preview Postgres container.
- The shared template database restores the configured production database dump from S3 once; new PR databases clone that template, then apply newer Prisma migrations.
- Deploys avoid ECR pushes and Terraform applies on the hot path.
- The preview URL is `https://pr-<number>.$PREVIEW_FORGE_DOMAIN` when TLS is enabled.
- The default runtime is `PREVIEW_FORGE_RUNTIME=fast`: source is bind-mounted, Bun dependencies live in Docker volumes, React Router runs in dev mode, and warm deploys skip dependency install, Prisma generate, and migration work when the tooling fingerprint has not changed. The web container is still recreated after each source sync so the dev server starts from a clean process. Set `PREVIEW_FORGE_RUNTIME=production` to use the production Dockerfile build path.

## Host Setup

Provision an EC2 instance with enough CPU and disk for concurrent Docker builds. Start with at least `t3.large` or `c7i.large` and 120 GB gp3. The first host can live in the default VPC because the app stack is self-contained.

Attach an IAM instance profile that can read the configured production dump object. The current host uses `yawp-preview-forge-host`, scoped to `s3:GetObject` on `arn:aws:s3:::yawp-preview-videos/production.dump` plus `s3:GetBucketLocation` and prefix-scoped `s3:ListBucket` on the bucket. The deploy script restores through the host AWS CLI when the shared template database does not exist. Preview app containers set `AWS_EC2_METADATA_DISABLED=true`, and host bootstrap adds Docker egress blocks for EC2 metadata addresses so app code cannot borrow the host role.

Open inbound ports:

- `22` from GitHub Actions egress or the office/VPN range used for operations.
- `80` and `443` from the internet for Traefik.

Then run:

```bash
PREVIEW_FORGE_ROOT=/srv/yawp-preview-forge \
PREVIEW_FORGE_ACME_EMAIL=ops@yawp.school \
bash scripts/preview-forge/bootstrap-host.sh
```

Point `*.preview.yawp.school` or the chosen wildcard domain at the host public IP.

For a temporary IP-based smoke host, use the dashed `sslip.io` form and disable TLS:

```bash
PREVIEW_FORGE_DOMAIN=54-243-7-236.sslip.io
PREVIEW_FORGE_TLS=false
```

## GitHub Configuration

Create an SSH deploy key for the host user and save the private key in GitHub:

```bash
PREVIEW_FORGE_HOST=<host-or-ip> \
PREVIEW_FORGE_DOMAIN=preview.yawp.school \
PREVIEW_FORGE_SSH_USER=ec2-user \
PREVIEW_FORGE_SSH_PRIVATE_KEY="$(cat ~/.ssh/yawp-preview-forge)" \
./scripts/github-preview-config.sh
```

Required repository settings:

- Variable `PREVIEW_FORGE_HOST`
- Variable `PREVIEW_FORGE_DOMAIN`
- Variable `PREVIEW_FORGE_ROOT`
- Variable `PREVIEW_FORGE_SSH_USER`
- Variable `PREVIEW_FORGE_TLS`
- Variable `PREVIEW_FORGE_RUNTIME`
- Variable `PREVIEW_DB_DUMP_S3_URI`
- Secret `PREVIEW_FORGE_SSH_PRIVATE_KEY`
- Secret `PREVIEW_LOGIN_EMAIL`
- Secret `PREVIEW_LOGIN_PASSWORD`

## Local Smoke

Run the same deployment path locally with a direct port:

```bash
PR_NUMBER=999 \
PREVIEW_FORGE_DOMAIN=localhost \
PREVIEW_FORGE_ROOT=/tmp/yawp-preview-forge \
PREVIEW_FORGE_DIRECT_PORT=18080 \
bash scripts/preview-forge/deploy.sh
```

Destroy it with:

```bash
PR_NUMBER=999 \
PREVIEW_FORGE_DOMAIN=localhost \
PREVIEW_FORGE_ROOT=/tmp/yawp-preview-forge \
bash scripts/preview-forge/destroy.sh
```

Login smoke credentials come from `PREVIEW_LOGIN_EMAIL` and `PREVIEW_LOGIN_PASSWORD`.

## Performance Notes

The hot path deliberately keeps state on the host: Docker layer cache, Bun dependency volumes, the shared restored template database, and PR-scoped Postgres databases. The first build on a cold host is slower because it creates the shared Postgres container and restores the production dump. Subsequent PR creates clone the template database locally, and warm PR updates skip tooling work when package, Prisma, and migration inputs are unchanged. In `fast` runtime, the web container still restarts by default; the speedup comes from removing package install, Prisma generate, migration, dump restore, and cloud control-plane work from the warm path.

Scheduled cleanup runs every six hours. It keeps open PRs, removes closed/stale preview directories after `PREVIEW_FORGE_TTL_HOURS` hours, drops the matching `yawp_pr_<number>` database, and removes legacy per-PR Postgres volumes left by older previews.
