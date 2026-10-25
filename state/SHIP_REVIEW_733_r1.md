# Ship Review — PR #733 (round 1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/733 |
| Branch | `cursor/demo-rsync-ssh-key-b091` |
| **Reviewed head** | **`6c5dc41360869f42566e7323cc6bffa641172298`** |
| Verdict | **SHIP** |
| Reviewer | Independent read-only ship review (Cloud Agent) |
| Date (UTC) | 2026-10-25 |

## Production failure (context)

After #730 fixed checkout-path references, workflow run **40154877225** reached **Prepare SSH** successfully, then failed at **Sync source and ensure intern QA teachers on demo** with rsync `Permission denied (publickey)`. `ssh` / `scp` in the same step already used `-i ~/.ssh/demo_key`; `rsync` did not pass `-e "ssh -i ~/.ssh/demo_key"`, so its implicit SSH transport ignored the key written by `prepare-demo-ssh.sh`.

## Diff scope

Single commit on reviewed head. Two files changed (+10 / −0):

- `.github/workflows/demo-ensure-intern-qa-teachers.yml` — one line added to the existing `rsync` invocation
- `scripts/deployment-contract.test.ts` — assertions on the sync step’s `rsync` / `ssh` / `scp` key usage

No unrelated drive-by edits.

## Review bar

### 1. Diff matches claim; matches demo rsync pattern

| Check | Result |
| --- | --- |
| Adds `-e "ssh -i ~/.ssh/demo_key"` immediately before the `demo-source/` rsync source path | Pass |
| Same `-e` spelling as `demo-environment.yml` (lines 344, 354) and `demo-host-monitoring.yml` (line 51) | Pass |
| Does not alter remote paths, ensure script logic, or teacher grep assertions | Pass |

### 2. Safety boundaries (secrets, reset, trigger, environment)

| Check | Result |
| --- | --- |
| `workflow_dispatch` only | Pass (`parsed.on` unchanged) |
| `environment: demo` | Pass |
| `concurrency.group: demo-environment` | Pass |
| No new secrets or literal key material | Pass (existing `secrets.DEMO_SSH_PRIVATE_KEY` only) |
| No `reset_data` / `RESET yawp_demo` / destructive seed language added | Pass (existing contract negatives retained) |

### 3. Contract test guards the rsync regression

Test **demo intern QA teachers workflow is dispatch-only and targets yawp_demo additively** now slices the sync step and requires:

- `rsync` … `-e "ssh -i ~/.ssh/demo_key"`
- `ssh -i ~/.ssh/demo_key`
- `scp -i ~/.ssh/demo_key`

Executed at reviewed head:

```text
bun test ./scripts/deployment-contract.test.ts -t "demo intern QA teachers"
→ (pass) demo intern QA teachers workflow is dispatch-only and targets yawp_demo additively
```

### 4. Unrelated changes

None observed.

## Merge / base note (non-blocking)

Reviewed head `6c5dc41360869f42566e7323cc6bffa641172298` branches from pre-#730 `main` (`61843f3d8`). Current `origin/main` already includes #730’s `demo-source/scripts/preview/...` path fixes (`3f534f3c1`). A three-way merge into today’s `main` is **conflict-free** and combines #730 path prefixes with this PR’s rsync `-e` line (verified with `git merge-tree`). Rebase before merge is optional hygiene, not a correctness defect in this diff.

End-to-end GitHub Actions re-dispatch was not run in this review; the failure mode and fix are mechanically aligned with other demo workflows.

## Decision

**SHIP** at head **`6c5dc41360869f42566e7323cc6bffa641172298`**.

Minimal rsync transport fix with deployment-contract coverage for the publickey regression introduced when only `ssh`/`scp` used the demo key.
