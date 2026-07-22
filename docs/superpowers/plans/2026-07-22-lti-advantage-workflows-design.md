# LTI Advantage Workflow Design

Issue: #213

## Goal

Complete the provider-neutral LTI Advantage pilot after secure launch: teacher
placement through Deep Linking, idempotent NRPS reconciliation, and durable AGS
grade delivery after an explicit Yawp grade release.

## Trust boundaries

- A verified, one-time LTI launch is the only source of context, resource-link,
  NRPS, AGS, return URL, and advertised-scope bindings.
- Every persisted workflow row carries registration, organization, and course
  mapping provenance. Database constraints reject mismatched tenants.
- LMS subjects are stored only as versioned HMACs. Network response PII is not
  persisted in diagnostics, audits, or retry records.
- The selected LMS adapter uses the public LTI 1.3/Advantage HTTP contracts.
  Tests intercept those real token, NRPS, Deep Linking, line-item, and score
  requests at the network boundary; production code contains no fixture branch.

## Persisted workflow

1. A signed launch records the NRPS/AGS endpoints and advertised scopes on its
   mapped course. A resource launch may bind the provider resource-link id to a
   previously created placement.
2. A teacher Deep Linking launch creates a short-lived, one-use selection
   request. Selecting an existing class assignment creates one stable placement
   and signs a standards-compliant response back to the LMS.
3. NRPS synchronization acquires a per-course database lock, hashes subjects,
   and reconciles only already-linked Yawp identities. LMS-managed enrollment
   rows distinguish sync additions from manual class membership, so a drop can
   never remove a manual enrollment. Unknown, duplicate, mixed-role, and
   conflicting identities become explicit diagnostics.
4. AGS line-item creation first finds by stable resource id and persists the
   provider URL. A grade event is enqueued only when the Yawp submission has a
   non-null `releasedAt`. The immutable score payload uses the assignment point
   value and released percentage.
5. Delivery updates one durable outbox row. Transient failures use bounded
   exponential backoff; terminal failures enter a recoverable dead-letter
   state. Reprocessing never creates a second line item or grade event.

## Human review markers

Human review is required before broad enablement for the selected Blackboard
product/version, institution placement and OAuth credentials, sandbox teacher
and learner proof, roster drop policy, privacy/accessibility/retention policy,
and release/support ownership. Those gates do not prevent local implementation
or deterministic network-level proof.

## Deferred

Dynamic registration, Assignment and Submission Review services, vendor-private
REST APIs, automatic account creation from LMS PII, and non-Blackboard adapters
remain outside the v1 contract frozen in #211.
