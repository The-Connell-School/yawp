# SDLC Reviewer Worker Prompt

Run directory: `/Users/bryantbrock/.codex/worktrees/e1c9/yawp/docs/superpowers/sdlc-runs/2026-06-23-anthropic-outage-fallback`
Run id: `sdlc-da9118dcf6e7`
Ticket: YPM-FIX-ANTHROPIC-OUTAGE-FALLBACK
Reviewer role: `code-quality-reviewer`
Context mode: `full-context`
Risk tier: `critical`
Required proof: red_green_test_log, fresh_verification_commands, code_review_artifact, release_gate, evidence_pack, minimal_hotfix_scope_proof

## Mission

You are `code-quality-reviewer` for SDLC run sdlc-da9118dcf6e7.
Ticket: YPM-FIX-ANTHROPIC-OUTAGE-FALLBACK
Risk tier: critical; required proof: red_green_test_log, fresh_verification_commands, code_review_artifact, release_gate, evidence_pack, minimal_hotfix_scope_proof.
Mission: Find correctness, maintainability, test, and regression issues in the changed code.
Return findings first, severity ordered, with evidence. Critical and important findings must block completion unless fixed or rebutted.

## Evidence To Inspect

- `ACCEPTANCE.md`
- `PLAN.md`
- `RED.log`
- `GREEN.log`
- `IMPLEMENTATION-SUMMARY.md`
- `QA.md`
- `RELEASE-GATE.md`
- `PROOF-MAP.json`
- `COMMAND-EVIDENCE.json`

Use full run context and inspect implementation, tests, proof, and release artifacts.

## Required Output

Return a concise review with:

- `Classification: pass` or `Classification: blocked`
- Findings first, severity ordered
- File/line evidence when applicable
- Required fix or evidence-backed rebuttal for every blocker
