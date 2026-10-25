# Ship Review — PR #730 (round 1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/730 |
| Branch | `cursor/fix-demo-ensure-intern-qa-ssh-paths-12e1` |
| **Reviewed head** | **`1a2fe9dc4ea460b27a87c01255a583fe9799a4ed`** |
| Verdict | **SHIP** |
| Reviewer | Independent read-only ship review (Cloud Agent) |
| Date (UTC) | 2026-10-25 |

## Production failure (context)

Workflow [`demo-ensure-intern-qa-teachers.yml`](https://github.com/The-Connell-School/yawp/actions/runs/40153981822) failed at **Prepare SSH** with:

`bash: scripts/preview/prepare-demo-ssh.sh: No such file or directory`

Cause: **Checkout application ref** uses `actions/checkout` with `path: demo-source`, so repository files are under `demo-source/`, not the job workspace root. Prepare SSH and the ensure `scp` step still referenced bare `scripts/preview/...` paths.

## Diff scope

Single commit on reviewed head. Two files changed:

- `.github/workflows/demo-ensure-intern-qa-teachers.yml` (+2 / −2)
- `scripts/deployment-contract.test.ts` (+9 / −2)

No other drive-by edits.

## Review bar

### 1. Diff matches claimed fix; safety boundaries

| Check | Result |
| --- | --- |
| Prepare SSH uses `demo-source/scripts/preview/prepare-demo-ssh.sh` | Pass |
| `scp` uses `demo-source/scripts/preview/ensure-intern-qa-teachers-on-demo-host.sh` | Pass |
| Ensure script semantics / remote execution unchanged | Pass (only local path prefixes on the runner) |
| Still `workflow_dispatch` only | Pass (`parsed.on` unchanged) |
| Still `environment: demo` | Pass |
| No new secrets or secret values | Pass (existing `secrets.DEMO_SSH_PRIVATE_KEY` only) |
| No `reset_data` / destructive demo reset language added | Pass (contract negatives retained) |
| No production deploy paths introduced | Pass (`PREVIEW_*` demo host vars unchanged) |

### 2. Path consistency with checkout and rsync

- Checkout step: `path: demo-source` (unchanged).
- Rsync already used `demo-source/` as the source tree (unchanged).
- Prepare SSH and `scp` now read scripts from the same checkout tree as rsync.

`prepare-demo-ssh.sh` is cwd-independent (uses env vars and `~/.ssh` only); invoking it via `bash demo-source/scripts/preview/prepare-demo-ssh.sh` is sufficient.

Note: Other demo workflows that checkout at repo root (e.g. `demo-internal-keys-audit.yml`) correctly keep bare `scripts/preview/...` paths. This workflow is distinct because of the subpath checkout.

### 3. Contract test guards regression

In `scripts/deployment-contract.test.ts`, test **demo intern QA teachers workflow is dispatch-only and targets yawp_demo additively**:

- Requires full strings `demo-source/scripts/preview/prepare-demo-ssh.sh` and `demo-source/scripts/preview/ensure-intern-qa-teachers-on-demo-host.sh`.
- Rejects `run: bash scripts/preview/prepare-demo-ssh.sh` via `not.toMatch`.
- Retains existing guards: `reset_data`, `RESET yawp_demo`, `seed-local-dev`, Thomas Patton / org assertions.

Executed at reviewed head:

```text
./bin/project test --profile project-cli --json
→ (pass) demo intern QA teachers workflow is dispatch-only and targets yawp_demo additively
```

(Unrelated failures in the same profile: two `project-agent.test.js` fixture-discovery tests — pre-existing / environment; not introduced by this PR.)

### 4. Unrelated changes

None observed.

## Residual notes (non-blocking)

- Contract test does not add a separate negative assertion for a bare `scp ... scripts/preview/ensure-...` line; the positive `toContain` on the prefixed ensure script path is sufficient to fail if `scp` regresses.
- End-to-end workflow success on GitHub Actions was not re-run in this review; the root cause and fix are mechanically aligned with checkout layout.

## Decision

**SHIP** at head **`1a2fe9dc4ea460b27a87c01255a583fe9799a4ed`**.

Minimal, correct path fix for the `demo-source` checkout layout, with deployment-contract coverage that blocks recurrence of the Prepare SSH bare-path bug.
