# SDLC Evidence Pack

Run: `sdlc-da9118dcf6e7`
Ticket: YPM-FIX-ANTHROPIC-OUTAGE-FALLBACK
Lane: `hotfix`
Risk tier: `critical`
Domains: code

## Required Proof

- red_green_test_log
- fresh_verification_commands
- code_review_artifact
- release_gate
- evidence_pack
- minimal_hotfix_scope_proof

## Proof Map

- `red_green_test_log`: `pending` via RED.log (red-test-log), GREEN.log (green-test-log)
- `fresh_verification_commands`: `pending` via TEST-PLAN.md (command-plan), GREEN.log (command-output)
- `code_review_artifact`: `pending` via REVIEW.md (review)
- `release_gate`: `pending` via RELEASE-GATE.md (release-gate)
- `evidence_pack`: `pending` via EVIDENCE-PACK.md (evidence-pack)
- `minimal_hotfix_scope_proof`: `pending` via IMPLEMENTATION-SUMMARY.md (hotfix-scope)

## Available Artifacts

- `RUN.md`
- `TRACE.jsonl`
- `TASK-BRIEF.json`
- `REPO-PROFILE.json`
- `WORKSPACE-PROOF.json`
- `RUN-MANIFEST.json`
- `ROUTING.json`
- `ASSUMPTIONS.json`
- `EVIDENCE-REQUIREMENTS.json`
- `REVIEW-SWARM.json`
- `SUBAGENT-RUNS.json`
- `PROOF-MAP.json`
- `COMMAND-EVIDENCE.json`

## Final Claim Gate

Do not claim done unless every required proof item above is backed by a current artifact, command log, media link, or explicit stop state.
