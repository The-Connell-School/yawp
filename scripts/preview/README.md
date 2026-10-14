# Preview host control plane

PR previews use one shared Docker host. `wake-preview.sh` starts existing Compose containers without rebuilding, and `enforce-cap.sh` admits deployments under the shared host lock.

At the default cap of eight running previews, both paths sleep the preview with the oldest `last-human-activity`. Missing activity falls back to the web container's `StartedAt`, then legacy Compose deploy metadata if Docker history is unavailable. Equal timestamps use ascending PR number. The incoming preview is never selected. All running previews compete regardless of branch, author, draft state, or how recently they woke.

`idle-sleep.sh` applies the 48-hour human idle deadline to every preview. Wake rate limits, open-PR validation, quarantine, and browser/origin checks remain active. Wake leases still serialize idle handling but do not exempt previews from capacity eviction.

Capacity sleep uses `compose stop` and retains resident database, containers, volumes, images, and access state. Resident-cap reclamation remains a separate operation with existing draft/activity eligibility, incoming and inflight protection, and cleanup paths; running eviction does not invoke it.

`Preview host bootstrap` runs from main, replaces the ingress control plane, and preserves running resident containers. Record every running PR web container's ID and `StartedAt` before and after rollout. Remove obsolete host exemption markers without stopping previews. GitHub label changes no longer trigger deployments.

The staff dashboard lives at https://internal.yawp.school/previews. The status hostname redirects HTML requests there (302). `/__status` JSON exposes activity, state, idle deadlines, and memory; when `PREVIEW_STATUS_TOKEN` is configured it requires `Authorization: Bearer <token>`, checked with constant-time digest comparison before collecting status. Without a configured token, JSON retains its previous behavior. `/__wake` behavior is unchanged.

Set the shared `PREVIEW_STATUS_TOKEN` GitHub secret for the host and the internal app runtime. The bootstrap workflow forwards it to the host, which installs a root-owned 0600 `ingress/status.env` for systemd; the token never appears in the service unit. Use a random base64url token of at least 32 characters. Omitting the secret on a later bootstrap preserves an existing token. Bootstrap replaces ingress without restarting running preview containers.

Bounded local verification:

```bash
~/.bun/bin/bun test ./scripts/preview/ --timeout 180000
```

See [the operator runbook](../../docs/runbooks/preview.md) for configuration and rollback.
