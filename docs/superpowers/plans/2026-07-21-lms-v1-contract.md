# LMS v1 Contract Implementation Plan

Issue: #211  
Design: `docs/superpowers/specs/2026-07-21-lms-v1-contract-design.md`

## Goal

Freeze and prove Yawp's provider-neutral LTI 1.3/LTI Advantage network boundary
with Blackboard Learn as the first documented reference profile.

## Tasks

1. Add RED contract tests for registration URL policy, LTI claim parsing,
   signature and audience verification, prohibited JOSE headers, expiry,
   deployment mismatch, target mismatch, and deterministic normalization.
2. Implement strict registration schemas, provider profiles, JWT primitives,
   and launch verification using platform keys fetched from the configured JWKS
   endpoint.
3. Add a deterministic standalone mock LTI platform with real HTTP endpoints
   for OIDC authorization, JWKS, OAuth tokens, NRPS, Deep Linking, AGS, failure
   injection, in-memory state, and a redacted request journal.
4. Add a network contract test that runs the actual OIDC form-post flow, fetches
   JWKS over HTTP, exchanges a signed client assertion, follows NRPS pagination,
   performs a nonce-bound Deep Linking round trip, lists/filters AGS line items,
   and creates/reads/updates a line item before submitting an AGS score.
5. Add cross-role and hostile-network tests for learner/instructor separation,
   wrong deployment, wrong nonce, Deep Linking replay/capability violations,
   unauthorized or expired scopes, disabled registrations, missing bearer
   tokens, cross-origin service resources, private-network destinations,
   streamed timeout/body-limit failures, malformed JSON/provider payloads,
   provider errors, and secret redaction.
6. Add an executable `proof:lti-contract` command that starts the platform,
   runs the integration, prints a redacted machine-readable result, and exits
   nonzero on any contract drift.
7. Run focused tests, the proof command, web-app tests, typecheck, and build.
8. Record exact-commit backend proof, five-role review, release gate, evidence
   pack, and a GitHub #211 comment with non-blocking human markers.

## Commit strategy

Use separate local commits for documentation, failing tests, implementation,
and review remediations where practical. Do not push, merge, deploy, use partner
credentials, or contact an institution without Bryant's explicit approval.
