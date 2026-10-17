# I1 approval integration after #581

1. Refresh main and rebase the existing PR branch, preserving main delivery and all I1 projections.
2. Add failing signed-route PostgreSQL acceptance regressions before moving the requireV2 guard behind eligible dispatch. Keep refusal immediately before legacy fallback.
3. Verify actual durable delivery through captured provider calls with a controlled clock: immutable replay, concurrent keys, ten-minute boundary, shared cap, terminal/forward races, failures, uncertainty, and verified outcome audit. Preserve accepted-history P2 coverage and flag-off reads.
4. Run focused project CLI profiles, landed delivery lifecycle tests and web-app typecheck. No UI/browser/screenshot work, flags activated outside isolated tests, migration changes or real email.
5. Push the existing branch, update draft PR #593 with [skip preview], inspect final-head CI and request independent Ship Review. Record exact evidence and remaining gates in lane handoff. Driver owns merging.

Dependency #581 is merged as 634687035. The existing schema and delivery engine are reused without copied implementation or duplicate migrations.
