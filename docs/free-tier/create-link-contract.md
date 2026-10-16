# Internal event-link create contract

`ft-create-link-action-400` tracks QA filing `qa-create-link-post-89-verify`.
The historical hosted failure occurred at 2026-10-14 17:00 UTC: one valid
Internal Create click returned 400 and no matching row appeared after reload.

Internal's ordinary defaults produce this signed JSON envelope:

```json
{"label":"Event booth","bypassWaitlist":false,"createIdempotencyKey":"create-link-operation-1"}
```

The mapper omits the unlimited cap (`maxUses=0`), empty strings and null dates.
Positive caps are numbers; populated dates become ISO date-time strings.
`createIdempotencyKey` belongs to the HTTP envelope. The handler removes it
before calling the strict token service and binds the creator to the HMAC actor.
The same operation key replays one token; another key creates a separate token.

The previous demo revision `8634f592` passed the full envelope to the strict
service schema and rejected the request-only key. Platform #458 already fixed
this on main (`710db14f`). Passing the same Internal-signed payload through the
old HTTP handler reproduces 400; the current handler returns 200. Current main
needs no additional product patch for that validator defect.

The manager's **Demo environment** run
[38609335025](https://github.com/The-Connell-School/yawp/actions/runs/38609335025)
succeeded at 17:52 UTC, shipping `35dbf87` with `reset_data=false`. Main's
production deployment does not update demo. Internal's production deploy run
[38610518244](https://github.com/The-Connell-School/yawp-internal-v3/actions/runs/38610518244)
succeeded for `52dc904`.

The builder's authenticated demo-only retest at 18:18 UTC returned **401**,
`ok=false`, one POST and zero matching rows. This is a separate current blocker;
hosted success has not been demonstrated. The checked-in demo workflow forwards
the bearer management credential, and its compose renderer exposes only
`YAWP_MANAGEMENT_SERVICE_KEY`; neither has a path for `YAWP_INTERNAL_API_KEYS`.
Current token writes require a signature. Live secret values and runtime signing
configuration were not inspected, so the exact deployed configuration mismatch
is unconfirmed. Do not weaken signed-write authentication to accommodate it.

Manager follow-up: establish the demo server's scoped HMAC configuration and
Internal's corresponding demo signing configuration, preserving existing secrets
and keeping production out of this task. The manager owns demo deployment; keep
`reset_data=false`. QA must independently repeat the unique-label create/reload
check after that work and record both deployed revisions and run IDs. Keep this
backlog item in progress pending the regression PR merge and hosted verification.

Local evidence is under the free-tier-fixes lane's
`shots/ft-create-link-action-400/`. The real-handler probe uses the actual Internal
client, signatures, platform HTTP validator and create service, with database and
feature-flag lookup stubbed. Local Playwright exercises the actual Internal app
with an isolated staff/session database and this handler bridge: ordinary submit,
rapid repeat, empty required label, and retryable server rejection. The local
matching-row check therefore proves reload behavior against the bridge, not
persistence in the hosted demo database. Screenshots mask codes and QR images.
The historical QA evidence is preserved separately in the free-tier-qa lane.
