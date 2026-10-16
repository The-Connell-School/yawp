# Flagged approval waiting and delivery

1. Add failing browser and real-database tests for current sent details, encoded mailto, forwarding ownership/input/stale links, reminder clock/cap/retry/concurrency, and rollout controls.
2. Add only approval cadence/history fields and a durable encrypted email outbox. Share an application advisory lock across approval, forward, reminder, and delivery. Preserve legacy callers when onboarding v2 is disabled.
3. Implement the waiting/forward forms and responsive information-left approval layout using existing sign-in tokens. Keep an empty guide slot until supplied content exists.
4. Add bounded runtime delivery using the existing delivery-loop pattern, project CLI proof profiles, and the I1 consumer contract. No remote migrations, mail, flags, previews, or merge.
5. Run focused tests, full typecheck, and local one-worker browser captures. Request independent Ship Review, commit/push, open a [skip preview] platform PR, record held merge handoff, and clean up owned processes/temp.
