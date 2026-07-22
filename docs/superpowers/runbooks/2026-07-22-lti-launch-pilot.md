# LTI 1.3 Launch Pilot Runbook

Issue: #212
Default state: off
Pilot reference shape: provisional Blackboard Learn LTI 1.3 registration

## Safety contract

- Never identify or merge a Yawp user by LMS email. A first launch requires an
  authenticated Yawp account, a matching active organization membership and
  role, and explicit confirmation.
- Keep both gates off until registration, mapping, provider metadata, browser
  proof, and institution approval are complete.
- One `(issuer, client ID, deployment ID)` belongs to one Yawp organization.
  Do not reuse a deployment across organizations.
- Treat issuer, client ID, deployment ID, context ID, and public endpoints as
  configuration. Do not paste private keys, bearer tokens, launch JWTs, raw
  subjects, state, nonce, email, or student data into the admin screen, logs,
  issues, or evidence.

## Registration

Human review required before live configuration: confirm Blackboard versus
Blackbaud, the named institution and LMS version, sandbox owner, approved data
policy, and the provider's production support contact.

1. In the provider sandbox, register Yawp as an LTI 1.3 tool with these Yawp
   routes on the approved application origin:
   - OIDC login initiation: `/lti/login`
   - Resource launch: `/lti/launch`
   - Yawp tool JWKS URL: the approved v1 registration value
2. Collect the provider issuer, client ID, deployment ID, authorization/token
   endpoints, JWKS URL, allowed audience, service origin, and exact Yawp target
   links. Compare them with the provider's signed metadata or admin export.
3. As a Yawp global admin, open
   `/app/admin/organizations/{organizationId}/lti`.
4. Leave **Organization LTI access** off. Create the registration from the
   reviewed JSON. Creation is disabled-first regardless of input.
5. Create one course mapping using the LMS context ID and a class owned by the
   same organization. Cross-organization mappings fail at both service and
   database boundaries.
6. Re-read the redacted registration and mapping in the diagnostics screen.
   Verify issuer/client/deployment, endpoint origins, and class. Enable the
   organization gate first; the disabled registration still prevents launches.
   Enable the reviewed registration last.
7. Perform teacher and learner launches. Each first launch must show only
   organization, course, and mapped role before explicit linking. Verify the
   teacher reaches mapped-class management and the learner reaches the student
   workspace with that class enrollment.

## Credential-independent proof

Run on a clean local checkout with a modern Node/Bun runtime:

```sh
bun run --cwd services/web-app proof:lti-contract
E2E_PORT=5174 bunx --cwd services/web-app playwright test \
  --project=chromium e2e/tests/lti-launch-pilot.spec.ts
bun run --cwd packages/prisma lti-launch:postcheck
```

The Playwright proof starts a real PostgreSQL database, applies production
migrations, seeds deterministic teacher/learner/course identities, starts an
independent HTTP LMS process, and exercises browser form posts. Production code
contains no fixture or scenario branch.

Live sandbox teacher/learner acceptance remains a human marker. Do not substitute
the mock proof for institution approval.

## Provider signing-key rotation and outage

- Provider signing keys are fetched only from the registered JWKS URL, cached
  for the registration TTL, and selected by `kid` and permitted algorithm.
- A new or same-`kid` rotated key triggers one forced refresh. If refresh fails,
  signature verification fails closed; no account link or tenant session is
  created.
- During planned rotation, ask the provider to overlap old and new public keys.
  Run a new teacher and learner launch while both keys are published, then after
  the old key is removed.
- During an outage, leave the integration enabled only if repeated retries are
  operationally acceptable. Yawp shows a generic public error; administrators
  use redacted audit outcomes. Never bypass signature validation or lengthen
  token/state windows to recover service.

## Diagnostics

Use the organization LTI admin page. Check, in order:

1. Organization gate and registration state.
2. Exact issuer/client/deployment and allowed target-link origins.
3. Active context-to-class mapping and class organization.
4. Recent redacted event type/outcome sequence:
   `oidc_login_initiated`, `launch_completed`, `identity_linked`, and admin
   configuration events.
5. Provider JWKS endpoint health and current public `kid` values outside Yawp.

Public support code `LTI-100` intentionally does not disclose the failure
cause. Audit records may contain hashes and bounded context IDs, but must never
contain raw subject, state, nonce, launch token, bearer token, email, or profile
claims.

After a migration, run `bun run --cwd packages/prisma lti-launch:postcheck`.
Any missing table/trigger, tenant mismatch, invalid digest, or outstanding
artifact under a disabled gate is a release blocker.

## Disablement and uninstall

For immediate containment:

1. Turn off **Organization LTI access**. This consumes outstanding launch/link
   artifacts for every registration in the organization.
2. Disable the affected registration. This also invalidates its outstanding
   artifacts and prevents provider network access from public LTI routes.
3. Preserve redacted audits for incident review. Do not delete identities as a
   first response.
4. Reproduce with the network mock and review provider metadata before any
   re-enable.

Uninstall is intentionally stronger and cannot be reversed in place. Confirm
the exact organization and registration with a second human, then use
**Uninstall**. Create and review a fresh registration for any later reinstall.

## Rollback

1. Gate the organization off, disable the registration, and verify no
   outstanding artifacts with the postcheck.
2. Roll back application code through the normal reviewed release process.
   The additive schema and default-false column may remain safely deployed.
3. Do not reverse the migration while audit or identity rows exist. A schema
   reversal requires a separately reviewed data-retention/export plan.
4. Re-enable only after security/data review, selected-provider sandbox proof,
   UX/admin-copy review, release approval, and a documented support owner.
