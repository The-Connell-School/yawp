# Flagged approval waiting and delivery

1. Add failing browser and real-database tests for current sent details, encoded mailto, forwarding ownership/input/stale links, reminder clock/cap/retry/concurrency, and rollout controls.
2. Add only approval cadence/history fields and a durable encrypted email outbox. Share an application advisory lock across approval, forward, reminder, and delivery. Preserve legacy callers when onboarding v2 is disabled.
3. Implement the waiting/forward forms and responsive information-left approval layout using existing sign-in tokens. Keep an empty guide slot until supplied content exists.
4. Add bounded runtime delivery using the existing delivery-loop pattern, project CLI proof profiles, and the I1 consumer contract. No remote migrations, mail, flags, previews, or merge.
5. Run focused tests, full typecheck, and local one-worker browser captures. Request independent Ship Review, commit/push, open a [skip preview] platform PR, record driver merge handoff, and clean up owned processes/temp.

## Rebase and renewed verification, October 16

Preserve old head `19707bddd442f7c5b0036c3f1429c3ddcebff928` on a recovery
branch and rebase the existing task branch onto `41fede7b1e8d8fca6ebc3e8f149bbfc88c0f7a68`.
Keep main's class-preparation, below-HS and schema additions alongside delivery
locking and prior reminder corrections. Preserve both CI registrations and all
CLI/browser profile discovery protections. Re-run approval, CLI, main class-step
compatibility and full typecheck; refresh local browser/artboard evidence. Reuse
PR #581 with a lease-protected branch update and obtain exact-head independent
Ship Review and CI. The merge hold is released; driver snapshot and merge gates
remain. No remote environment changes or actual email delivery.
