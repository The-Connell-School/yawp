# Verification plan

1. Run focused billing/webhook tests and the repository typecheck.
2. Deploy current `main` through the official demo workflow with `reset_data=false`.
3. Require the workflow's pre/post aggregate counts to show no decreases.
4. Replay a real paid Stripe sandbox checkout event and query PostgreSQL for the durable webhook event and active license.
5. Run a new browser journey from the UA one-click URL through signup, email verification, Stripe Checkout, dashboard, and class-code dialog.
6. Query PostgreSQL for the new student's role, license amount/status/cutoff, and additive user count.
7. Replay the same Stripe event and assert one event row and unchanged license state.
8. Disable the obsolete Stripe endpoint and verify the current endpoint remains enabled.
