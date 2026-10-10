# Release gate

Decision: GO for demo.

- Current `main` deployed: yes.
- Collaboration feature included: yes, merge c416244a / PR #267.
- UA Stripe fix included: yes, 882a9826 / PR #344.
- Persistent demo data reset: no.
- Aggregate data loss: none.
- Real Stripe sandbox checkout: passed.
- Signed webhook activation: passed.
- Duplicate event idempotency: passed.
- Browser end-to-end flow: passed.
- Obsolete webhook endpoint: disabled.

Production live-mode release is a separate gate requiring the production Stripe key, live price, and live endpoint signing secret.
