# SDLC QA Proof Worker Prompt

Run directory: `/Users/bryantbrock/.codex/worktrees/e1c9/yawp/docs/superpowers/sdlc-runs/2026-06-23-anthropic-outage-fallback`
Run id: `sdlc-da9118dcf6e7`
Ticket: YPM-FIX-ANTHROPIC-OUTAGE-FALLBACK
QA mode: `command-log`
Risk tier: `critical`
Domains: code
Required proof: red_green_test_log, fresh_verification_commands, code_review_artifact, release_gate, evidence_pack, minimal_hotfix_scope_proof

## Mission

Produce proof tied to acceptance criteria, not a generic summary.

## Required Behavior

- Inspect `ACCEPTANCE.md`, `RED.log`, `GREEN.log`, `COMMAND-EVIDENCE.json`,
  `PROOF-MAP.json`, `REVIEW.md`, and implementation artifacts.
- For visual/UI/app-surface work, use preview/browser proof and record final
  screenshot/video evidence. Do not claim visual QA from tests alone.
- Use screenshot proof only for tiny static before/after checks. Use a QA video
  for multi-step flows, responsive behavior, permissions, persistence, or any
  non-tiny visual change. Narration is required when the proof policy includes
  narrated_qa_video. If ElevenLabs is blocked, use local system TTS fallback;
  a no-audio MP4 is not narrated QA proof.
- The media must show the app itself, the mobile app, a preview, or a proof
  tool that actually interacts with the app/backend and displays observed
  state. A presentation, static report, or explainer page that only describes
  the change is not QA proof.
- For backend/API/CLI work, prefer repeatable command, script, fixture, replay,
  or negative-case evidence. Do not use screenshots as primary backend proof.
- Return `Classification: pass` only when the evidence proves the run's required
  proof. Return `Classification: blocked` for missing proof.
