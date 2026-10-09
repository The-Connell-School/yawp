### Failure Checklist — When the gate blocks or prod spikes

If the gate BLOCKs
- Read reasons printed by `scripts/release-gate/gate` and fix them in priority order:
  - Add missing server-side flag checks (Rule 1/10).
  - Remove destructive SQL or risky UPDATEs (Rule 2/13).
  - Add/restore tests for each risk (Rule 8).
  - Add “Risks:” and “Rollback:” to PR body; update the verdict file if used (Rule 14).
  - Rebase on `main` to resolve “branch behind main”.
- Re-run the gate locally, then re-push. The GitHub “release-gate” check should turn green.

If a post-release spike happens
1) Contain
- Immediately disable the per-org feature flag for the pilot org:
  - `bun scripts/release-gate/canary/disable-flag --org <ORG_ID> --flag <FLAG_NAME>`
- If systemic, perform a targeted revert (owner only) of the merge commit to stop the rollout.

2) Observe
- Keep the watcher running:
  - `bun scripts/release-gate/canary/watch --minutes 10 --error-threshold 5 --server5xx-threshold 10 --org <ORG_ID> --flag <FLAG_NAME>`
- Confirm error and 5xx rates return to baseline.

3) Notify
- Notify the repo owner and stakeholders with a concise incident note including:
  - Impact, start time, detection, mitigations taken, and current status.

4) Stabilize and root cause
- Add/strengthen tests that would have caught this.
- Identify which CORE_RULES were violated or not covered.
- Open a postmortem PR under `docs/postmortems/` within 24 hours of mitigation.

5) Resume rollout (optional)
- Only after tests enforce the fix and the watcher shows stable error/5xx/latency for a pilot org.

