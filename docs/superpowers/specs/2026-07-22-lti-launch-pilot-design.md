# Secure LTI Launch Pilot Design

Issue: #212  
Date: 2026-07-22  
Status: credential-independent implementation approved by autopilot brainstorming

## Outcome

Turn the #211 standards/network contract into a default-off, tenant-safe LTI
1.3 launch pilot. The implementation uses the provisional Blackboard reference
shape but keeps provider-specific transport behind the conformant registration
adapter. Live provider selection, sandbox credentials, and pilot acceptance
remain explicit human-review markers.

## Security invariants

1. A persisted `(issuer, clientId, deploymentId)` registration binds to exactly
   one organization; database composite keys and triggers defend that binding.
2. Both the organization and registration must be enabled before a public LTI
   route may fetch provider data, create state, expose tenant context, or mutate
   mappings.
3. OIDC state and nonce are random, stored only as SHA-256 digests, expire after
   five minutes, and are consumed atomically once. Replays fail even under
   concurrent callbacks.
4. The launch token is verified by the #211 Core verifier. Signing keys are
   cached briefly by registration and kid; an unknown kid triggers one real
   JWKS refresh, supporting provider rotation without token-supplied keys.
5. LMS subjects are stored as HMAC digests scoped to registration. Email and
   display-name claims are neither identity keys nor persisted by the launch
   domain.
6. A new external subject cannot create or merge a user. Linking requires a
   signed, one-time pending-link cookie plus an already authenticated Yawp user
   with an active membership in the bound organization and the exact mapped
   teacher/student role.
7. Instructor-only roles map to `TEACHER`; learner-only roles map to `STUDENT`.
   Mixed, absent, or unrelated roles fail closed.
8. A context launch requires an active course mapping whose class belongs to
   the registration organization. Teacher and learner destinations remain
   inside that mapped class route.
9. Public errors are generic. Audit records contain event type, outcome,
   registration/tenant identifiers, subject digest, context id, and bounded
   non-secret metadata—never tokens, raw state/nonce, email, or provider bearer
   credentials.
10. Disable/uninstall invalidates outstanding transactions and pending links;
    public LTI routes then perform no tenant read beyond the registration gate
    and no provider network request.

## Data model

- `Organization.ltiEnabled`: independent, default-false rollout gate.
- `LtiRegistration`: standards endpoints/capabilities, unique external key,
  default-false registration gate, disable/uninstall timestamps.
- `LtiLaunchTransaction`: hashed state/nonce, expected target/message type,
  bounded lifetime, atomic consumed marker.
- `LtiPendingLink`: one-time signed-cookie secret digest, subject digest,
  mapped role/context/destination, bounded lifetime and consumption marker.
- `LtiExternalIdentity`: unique `(registrationId, subjectHash)` to one active
  organization membership; no email identity.
- `LtiCourseMapping`: unique provider context to one tenant-owned class.
- `LtiAuditEvent`: append-only diagnostics with redacted metadata.

## Public flow

1. `GET|POST /lti/login` validates OIDC initiation, resolves one enabled
   registration without revealing tenant details, persists hashed state/nonce,
   and redirects to the registered authorization endpoint.
2. `POST /lti/launch` looks up state by digest, verifies the signed token over
   the real JWKS network boundary, maps roles/context, then atomically consumes
   the transaction.
3. A known subject creates a normal Yawp session and selects the linked
   membership. A session already authenticated as a different user fails.
4. An unknown subject receives a signed pending-link cookie and is redirected
   to `/lti/link`. After normal Yawp authentication, the user explicitly links
   an eligible membership. Email is informational only and is discarded.
5. `/lti/error` exposes only bounded support codes. Admin diagnostics and audit
   details live behind global-admin authorization.

## Admin and rollback

`/app/admin/organizations/:id/lti` shows the two gates, redacted registration
diagnostics, mappings, identity count, and recent audit outcomes. Admins can
disable or uninstall a registration, toggle the organization gate, and bind a
provider context to a class already owned by that organization. Re-enable is
explicit; rollback is gate-off first, then code/schema rollback if approved.

## Network-faithful QA

The existing independent mock platform gains an OIDC login-initiation caller
and launch callback support. Browser and backend proof use real HTTP between
the Yawp app and mock LMS, deterministic teacher/learner/course seeds, provider
key rotation/failure injection, and a real local PostgreSQL schema. No
production module branches on test names or returns fixture responses.

## Explicit human markers

- Confirm Blackboard versus Blackbaud and the named pilot/version.
- Assign sandbox owner and provide provider credentials.
- Approve procurement/data policy and retention details.
- Review UX copy and admin enablement before merge/deploy.
- Execute final selected-provider sandbox teacher/learner acceptance.

These markers do not block local credential-independent implementation.
