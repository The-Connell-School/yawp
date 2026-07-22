# LTI Advantage Pilot Runbook

Issue: #213
Default state: off
Dependency: follow the secure launch runbook before enabling these services.

## Initial setup

1. Configure `LTI_TOOL_SIGNING_KEYSET_JSON` as strict JSON with an
   `activeKeyId` and one to five `{keyId, privateKeyPem}` entries. Use a
   secret-manager value, never a repository/environment file. Publish
   `/lti/jwks` as the registration's tool JWKS URL.
2. Enable only the frozen v1 scopes: NRPS context-membership readonly, AGS
   line-item write, and AGS score write. Do not add vendor-private API scopes.
3. Map the signed LMS context to exactly one Yawp class. Run a top-level teacher
   Deep Linking launch and place an existing class assignment.
4. Confirm the Advantage workflow tab shows signed NRPS and AGS bindings, one
   placement, and no raw LMS user identifiers.
5. Run **Sync roster**. Review added, unchanged, unmatched, conflict, duplicate,
   and dropped counts. Unknown LMS users are never created or matched by email.
6. Launch the placed item as a learner, complete and grade a submission, then
   release it as a teacher. Confirm one AGS line item and one fully-graded score
   in the LMS gradebook.

## Roster resync behavior

- Active, already-linked identities are connected to the mapped class. A
  durable roster row records whether LTI made the connection.
- Inactive/deleted members are disconnected only when that row proves LTI made
  the connection. A manually added class member is preserved.
- Mixed roles, duplicate provider users, role mismatches, and unmatched hashes
  remain explicit redacted diagnostics. Operators resolve the source identity
  or role and run a new sync; do not edit the diagnostic row by hand.
- Reusing an idempotency key returns the completed result without another
  network call. Admin-initiated resyncs use a new key.

## Grade passback and recovery

- No outbox event exists before `Submission.releasedAt`. Releasing the same
  submission repeatedly cannot create another `(placement, submission)` event.
- Score mapping is deterministic: `scoreMaximum` is the placement's assignment
  point value and `scoreGiven` is the released numeric percentage multiplied by
  that maximum, rounded to two decimal places. Activity is `Completed`; grading
  is `FullyGraded`; timestamp is the immutable release time.
- Yawp release commits before any provider call. LMS downtime never rolls back
  student-visible grade release.
- HTTP 401/403 is `token_revoked`, 429 is `provider_rate_limited`, network/5xx
  is `provider_unavailable`, and other contract failures are redacted. Retry is
  bounded exponential backoff; the fifth failure is a dead letter.
- Use **Retry** in Advantage workflows after correcting credentials, scopes,
  service availability, identity, or duplicate line items. Never insert an
  outbox row or POST a score manually.

## Key rotation

Add the new RSA-2048-or-stronger private key to the keyset, make it active, and
keep the old public key published during provider propagation. Verify token,
Deep Linking response, NRPS, line-item, and score calls with the new `kid`, then
remove the old key after the institution confirms it is no longer cached. A
missing/weak/non-RSA/duplicate keyset fails closed and `/lti/jwks` returns 503.

## Unlink, disable, and incident response

Account unlink follows the secure-launch runbook and revokes LTI sessions. It
does not silently delete course roster history or released grade evidence.
For containment, turn off the organization gate and registration before
investigation; this prevents new launches and service grants. Preserve redacted
audits and workflow rows. Never paste JWTs, tokens, raw subjects, email, NRPS
responses, or student work into GitHub/support systems.

## Export and deletion

An organization export may include registrations, course mappings, placements,
hashed roster state, workflow summaries, grade status/score values, and audit
events. It must exclude private keys, tokens, raw LMS subjects, and transient
NRPS PII. Organization deletion cascades these tenant-owned rows. A standalone
audit-retention/purge policy still requires legal/security approval; do not
invent one during incident cleanup.

## Deterministic proof

With a migrated local PostgreSQL database:

```sh
bun test services/web-app/app/domain/lms/lti-advantage.server.integration.test.ts
bun test services/web-app/app/domain/lms/lti-network-contract.server.test.ts
bun run --cwd services/web-app typecheck
bun run --cwd services/web-app build
```

The Advantage integration test uses the independent HTTP platform, real OAuth
assertions, Deep Linking return, NRPS, line-item and score endpoints, mutable
seed rosters, and real database constraints. There is no production fixture
branch or mocked application adapter.

## Human review markers

- Confirm Blackboard Learn versus Blackbaud and exact institution/version.
- Obtain institution-owned credentials, approved placement, and live teacher +
  learner sandbox gradebook proof.
- Review roster drop policy, accessibility, privacy/data retention, migration,
  release, support ownership, and a small real-course calibration set.
- Dynamic registration, Assignment/Submission Review, vendor-private APIs,
  automatic PII account creation, and other LMS adapters remain deferred by
  #211.
