# Named-preview ingress rollout packet

Prepared for review; no upload, installation, restart or activation has occurred.

## Candidate and observed baseline

Candidate source commit: `7ad4b91d` (full SHA in manifest.json). Release ID: `d1c9b8694bac7dd225f29b9d99a27e67f4b847eb27d40502a2ebed427be6aede`. Local prepared directory: `/tmp/yawp-internal-ingress-review-7ad4b91d`. Reproduce using `./bin/project ingress-release prepare --revision FULL_SHA --output NEW_ABSOLUTE_DIRECTORY --json`; verify using `ingress-release verify --output DIRECTORY --release-id REVIEWED_RELEASE_ID --json`. Both commands are local preparation only.

The earlier `5f22f2c2` package is superseded: it omitted live host-alias support. Do not install it.

Target: AWS account `422348803522`, region `us-east-1`, preview host `i-0fe0cc97d034eb8b4`. Observed current release: `/srv/yawp-preview/ingress/releases/pr337-aac1bad3-official-ua`. Ingress and renewal run as `ec2-user`, Node `/usr/bin/node`. Recheck this baseline at rollout; if it changed, compare the new live source before proceeding.

Read-only source checks confirmed these live SHA-256 values:

| File | Live hash |
| --- | --- |
| ingress-server.mjs | e44025481ae2f9245dde109e183a1870eea4ede0136ebf3c701e449de8809f1a |
| wake-server.mjs | b8af4f718b79ebd2c97783cf00b40954ac4b1f57a6c1197e3d0b80e5af91cb8f |
| wake-preview.sh | 72c306da56a57f63d73435d9c54ce2992243f8aff62c672368b9235ceae7c19e |
| certificate-manager.mjs | d1dab413f772c1c4e71c08c0a2cda9dae0aabe6e30b23ec3d07da9062c0625a0 |

The live/base differences were explicit host-alias parsing and preservation of the alias in HTTP, WebSocket and redirect hostnames. The candidate retains all of them; both wake files now match live exactly. The certificate-manager base matches live. The new module and named-route changes are the remaining intended source changes.

## Installation boundary

1. Verify the candidate against its reviewed release ID and record the current symlink, service status and successful existing PR/alias requests. Stage the five source files and manifest in a new directory under `/srv/yawp-preview/ingress/releases/internal-RELEASE_ID`, with operator ownership and manifest modes. Verify the staged bytes again. Do not copy source trees, environment files, certificates, database files or Docker volumes.
2. Retain the existing service commands and settings. Prepare drop-ins for ingress and renewal that load the optional root-owned `/etc/yawp-internal/ingress.env`. Preserve existing alias, root, domain, ACME and wake settings. Prepare only the first-certificate service/path units documented in `scripts/preview/INTERNAL-INGRESS.md`, using the existing ingress operator and renewal environment. Validate the units on the target Linux host. Do not execute `bootstrap-host.sh`: its broader database/bootstrap actions are outside this rollout.
3. Stage the trusted Internal route directory and configure its actual owner UID. No feature source mount may include it. Keep the watcher disabled while staging. Back up any pre-existing drop-ins/configuration before replacing them.
4. During the approved restart window, atomically switch `current` to the new immutable release and restart ingress. Check existing PR and configured alias HTTPS, access gate and WebSocket behavior before enabling named traffic. Restarting ingress will disconnect active WebSockets; clients must reconnect. Source staging itself does not restart application containers.
5. Enable the route watcher, run its reconciliation service once, then exercise a disposable Internal environment through actual first issuance, authenticated public readiness, source update and pause/resume. Measure the complete request-to-usable-page path. Do not label the deployment verified from a TLS handshake alone.

## Rollback

If existing PR or alias checks fail, disable the new route watcher, restore the captured configuration/drop-ins and previous `current` symlink, reload systemd and restart ingress. Verify the same baseline requests. Keep application containers, databases, source caches, route registrations and certificates intact. Named previews will be unavailable on the old ingress; report that accurately rather than deleting their data. Retain both immutable releases for diagnosis.

## Evidence and outstanding checks

Local release/CLI tests: two tests / 11 assertions, including dirty-working-copy exclusion, existing-output refusal, tampering/symlink rejection and externally pinned verification. Project-CLI checks: 81 tests / 4213 assertions. Expanded ingress/wake suite: 82 tests / 328 assertions. Earlier named startup uses a real test process and hostname-verified HTTPS; Linux systemd validates the certificate units. Public ACME issuance, filesystem-watch delivery, real access-gate behavior, restart/recovery and latency still require target-host proof. Broader Yawp backend proof has existing failures and must not be represented as green.
