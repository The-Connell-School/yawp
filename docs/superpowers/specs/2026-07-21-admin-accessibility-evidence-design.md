# Admin Accessibility Evidence Contract Repair

Issue: #218  
Date: 2026-07-21

## Finding

The deterministic E2E admin session, assignment type, and route all load
correctly. The failure is a stale semantic-heading assertion:

- The manual evidence test added on 2026-06-27 expects `Assignment Type Details`.
- The assignment-type editor overhaul shipped on 2026-07-02 and intentionally
  exposes `Edit assignment type` as its edit-mode H1.
- The dedicated admin assignment-type E2E suite already treats
  `Edit assignment type` as the current product contract.

## Decision

Update only the stale manual-evidence heading assertion. Keep the role-based
locator, deterministic seeded record, real login, real route, keyboard tab-stop
collection, screenshots, and trace attachments unchanged. This repairs the
evidence contract without weakening what it proves.

## Verification

Run the exact keyboard-only smoke test on an isolated Playwright server. The
test must reach the current H1 and then emit the `admin-assignment-type`
tab-stop artifact, proving the evidence collection continued past the former
failure point.

