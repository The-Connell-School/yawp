# Builder Ship Review self-check — independent review pending

This is a builder self-check, not independent approval. The driver must review
the final pushed head and CI before merge. Hosted rows remain blocked pending
separate #565 execution.

- Default OFF: legacy loader/action dispatch tests pass; original/current local
  flag-OFF login screenshots have zero changed pixels at 1280px and 390px.
- Real authentication: wrong passwords create no session. Account context grants
  neither proof nor a login; existing resolver/password/rate limits/session and
  membership ownership checks remain active. No bypass headers or auth mocks in
  the opt-in real-DB checks or browser flows.
- Isolation: exact preview/seed/flag/DB/role/host/slug gates, existing master
  authorization, short signed context bound to master seat and fixture account,
  strict identity/membership namespace checks. Ordinary seat policy preserved.
- Negative cases: missing/forged/expired/future context, missing/revoked master
  seat, expired/forged pending selection, wrong passwords, unrelated users,
  unowned/inactive selections, actual DB mismatch, target overrides and
  demo/production/non-preview/flag-OFF all fail closed for QA privilege.
- Lifecycle: account/access switches clear context; QA entry clears stale
  membership and real application auth. Expired recovery sessions are rejected
  by middleware and deleted; an ordinary-seat-valid session retains its original
  access after QA privilege expires.
- Visuals: compared supplied v2 PNG/DOM/copy references and real local screens;
  fixture names/choice count, inherited font rendering and broken mobile
  reference artifacts are documented. Operator form uses existing components.
- No schema/migration/deployment/hosted/email/Google/secret or merge operation.
  No default setting or demo/production behavior is changed.
