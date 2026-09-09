# Internal scenario runner

`bin/internal-scenario-runner` is a trusted worker executable. Install a reviewed checkout outside feature source mounts, with Bun, its locked dependencies and generated Prisma client. Apply migration `20260909203000_internal_scenario_receipts` to the nonproduction target database first. No HTTP endpoint is exposed and existing application flows are unchanged.

The executable reads one Internal scenario request from stdin and emits only its matching JSON receipt. Input is bounded to 16 KiB. Failures emit a generic message to stderr and exit 1; never print request data or database credentials.

Configuration defaults to `/etc/yawp-internal/scenarios.json`. A trusted launcher may override `SCENARIO_CONFIG` with an absolute path. The regular file must be owned by the runner user and have mode 0600; symlinks are refused. Configure a `targets` array with entries:

```json
{
  "targets": [{
    "targetId": "registered-demo-id",
    "environment": "demo",
    "organizationId": "demo-organization-id",
    "databaseUrl": "postgresql://PREVIEW_USER:PREVIEW_PASSWORD@127.0.0.1:PREVIEW_PORT/yawp_demo"
  }]
}
```

Database connections are limited to localhost, 127.0.0.1 or the dedicated `yawp-internal-preview-postgres` host, with a `yawp_` database name and no query/schema override. Never configure production credentials or a tunnel to production. Only the operator-owned registration selects a database and organization; the request URL is never used for networking. Preview registrations also require an exact `revision` matching the incoming request. Keeping that registration synchronized with host publication remains an integration task.

Generation creates synthetic nonprivileged users without passwords, organization memberships, a school, classes and assignments using an available unarchived assignment type. `empty` creates assignments only; `draft` creates a draft for every student/assignment; `submitted` adds submissions for each draft; `mixed` submits alternating students. Existing organization seat limits apply. No AI, email or billing side effects are invoked.

One transaction contains generation and a durable receipt with actor, target, organization, fingerprint and exact created resource IDs. Concurrent copies of a job return the same receipt. Reusing a job ID with changed input fails. Reset retires only recorded scenarios for that target and organization: classes and documents are archived and generated memberships deactivated. History remains, unrelated resources remain active, and capacity or generation failures roll the entire reset back. Receipt provenance cannot be changed or deleted; retirement is recorded once with the replacing job ID.

Run `./bin/project test --profile internal-scenario-integration --json` for real local database and subprocess verification. It verifies generation, retry, scope rejection, reset rollback, immutable receipts, private configuration and output hygiene. The Internal repository now supplies `YAWP_PAIR_WORKSPACE=<ready scenario capsule> ./bin/project test-pair-scenarios`: both real databases, queued work, subprocess generation, a lost acknowledgement followed by same-job retry, matching audit and reset are verified locally. Automatic host registration, real EC2 execution and authenticated UI data verification remain outstanding.

## Container packaging

`./bin/project test --profile internal-scenario-container --json` builds `infra/Dockerfile.scenario` and tests the runner against the owned local capsule database on a temporary private Docker network. The build uses a Dockerfile-specific source allowlist and the frozen repository lockfile; local environment files and Git data are excluded. Runtime packaging includes the reviewed scenario service and generated Prisma client without building the web application.

The image entrypoint accepts the same stdin contract. Run it as the host registry owner's numeric UID/GID, with a read-only root filesystem and registry mount. The Internal repository provides `bin/scenario-docker-runner`, which selects an already installed immutable image ID and a configured private network. It grants the container neither a Docker socket nor platform credentials. Image rebuilds belong to trusted runner releases, never PM source updates.
