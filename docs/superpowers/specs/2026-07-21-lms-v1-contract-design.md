# LMS v1 Contract and Network Mock Design

Issue: #211  
Date: 2026-07-21  
Status: Approved for implementation by the autonomous Summer 2026 goal

## Outcome

Yawp will integrate with learning-management systems through a provider-neutral
LTI 1.3 core and the LTI Advantage service contracts. Blackboard Learn
Ultra/SaaS is the first reference provider profile, but provider-specific
behavior is isolated behind registration data and a small adapter boundary.
Canvas, PowerSchool, Google Classroom, and Blackbaud are not separate summer
implementations unless evidence shows they support the same contract or a
pilot owner confirms one as the actual launch platform.

The test platform is a real loopback HTTP service. Production contract code
makes ordinary network requests to it; tests do not replace `fetch`, mock an
import, or introduce test-only branches into launch verification. The platform
has deterministic identities, courses, memberships, keys, deep-link content,
line items, scores, and failure controls. This freezes the third-party wire
shape before persistence and UI work begins.

## Evidence and provider decision

| Evidence | Signal | Decision impact |
| --- | --- | --- |
| Summer Build Google Doc, May 26 | LMS support is pivotal for college contracts; notes say the UA pilot may use Blackbaud | Strong priority signal, ambiguous provider signal |
| YAWP Notes Google Doc, July 10 | LMS remains a summer priority | Confirms timing |
| Granola, May 26 product call | Canvas, Blackboard, PowerSchool, Google Classroom, and Blackbaud were named for research | Confirms provider discovery set, not a final selection |
| Granola, May 26 infrastructure call | Kevin's school uses Blackboard | Strongest verified first-provider signal |
| Gmail search | No authoritative pilot-provider confirmation found | Do not infer a final provider |
| 1EdTech LTI 1.3 and Advantage specifications | Standard OIDC launch, signed JWT claims, OAuth service tokens, NRPS, Deep Linking, and AGS | Defines the provider-neutral contract |
| Anthology developer documentation | Blackboard has an LTI 1.3 registration, launch, Deep Linking, NRPS/AGS, and OAuth profile | Makes Blackboard a practical reference adapter |

## Standards contract

The implementation follows these primary references:

- [LTI Core 1.3](https://www.imsglobal.org/spec/lti/v1p3/)
- [LTI Security Framework 1.0](https://www.imsglobal.org/spec/security/v1p0/)
- [LTI Advantage implementation guide](https://standards.1edtech.org/lti/guides/implementation_guide/implementation-guide)
- [Names and Role Provisioning Services 2.0](https://www.imsglobal.org/spec/lti-nrps/v2p0/)
- [Assignment and Grade Services 2.0](https://www.imsglobal.org/spec/lti-ags/v2p0/)
- [Blackboard LTI 1.3 registration](https://docs.anthology.com/docs/blackboard/lti/1.3/register-an-application)
- [Blackboard service-token authentication](https://docs.anthology.com/docs/blackboard/lti/1.3/lti-subsystems/lti-sub-authentication)

An enabled registration must identify one Yawp organization and contain:

- stable internal registration id;
- provider key and display name;
- issuer, client id, deployment id, and allowed audience values;
- OIDC authorization URL, OAuth token URL, and platform JWKS URL;
- Yawp login-initiation URL, resource-launch URL, Deep Linking launch URL, and
  tool JWKS URL;
- exact allowed target-link URLs and service origins;
- enabled service scopes, separately bounded by the scopes advertised in each
  signed launch;
- explicit enabled/disabled state.

All non-loopback endpoints must use HTTPS. Plain HTTP is accepted only when the
resolved hostname is an IP loopback or `localhost`, allowing the same
production contract code to exercise an actual local network service. No
environment-name or test-mode bypass is allowed. Public HTTPS requests resolve
the target before every request and reject private, loopback, link-local, and
metadata-class addresses. The selected vetted address is pinned into the actual
socket while the original host remains authoritative for HTTP Host, TLS SNI,
and certificate identity, eliminating a second DNS resolution/rebinding gap.
Redirects are handled manually and rejected.
Provider response bodies share the request deadline and are streamed through a
one-megabyte cap, including responses whose headers arrive before the body.

## Launch shape

The OIDC authorization request uses `scope=openid`, `response_type=id_token`,
`response_mode=form_post`, `prompt=none`, and carries the platform login hint,
message hint, client id, redirect URI, state, and nonce.

The signed launch must:

- use `RS256` and a non-empty `kid`;
- resolve the key from the configured platform JWKS URL;
- reject `none`, embedded `jwk`, `jku`, `x5u`, and `x5c` JOSE headers;
- validate signature, issuer, audience/authorized-party, expiry, issued-at,
  not-before, nonce, deployment id, message type, LTI version, and target-link
  URI, including `exp > iat` and bounded token lifetimes;
- require a stable subject, roles, context id, and resource-link id for a
  resource-link launch;
- expose only validated claim data to account and tenant mapping;
- consume state and nonce exactly once in the persisted launch flow in #212.

A Deep Linking launch may omit subject, roles, and context under Deep Linking
2.0. Its required settings are still validated and normalized. A response uses
a fresh signed nonce, returns the request's opaque `data`, and accepts only item
types, multiplicity, line-item metadata, and presentation modes advertised by
that request. For `ltiResourceLink`, URL, title, and line-item label remain
optional as required by the standard; date windows, images, window/iframe
preferences, `gradesReleased`, and fully qualified extension properties are
validated without inventing provider-only fields.

The contract parser returns a normalized value containing platform subject,
deployment, context, resource link, roles, optional person attributes, and
advertised service endpoints. It preserves platform opaque ids and never treats
email as the external identity key.

## Advantage service shape

The mock freezes the later #213 network boundary now:

- `POST /oauth2/token` accepts `client_credentials`, a JWT bearer client
  assertion with a standards-valid audience array, and a space-delimited scope
  set; token type is parsed case-insensitively and normalized. The returned
  bearer is wrapped in a frozen grant bound to registration, organization,
  deployment, returned scopes, and local expiry; service APIs do not accept raw
  token strings.
- `GET /contexts/:contextId/memberships` requires an NRPS bearer token and the
  LTI membership media type. The seed contains active instructors, active
  learners, one inactive learner, missing optional PII, role filtering, and
  paginated results with a `rel="next"` link.
- Deep Linking authorization returns a signed `LtiDeepLinkingRequest`; the mock
  independently validates a signed `LtiDeepLinkingResponse`, its fresh nonce,
  item schema, advertised capabilities, and opaque `data` (including a present
  empty string), accepts omitted `content_items` as no selection, and rejects
  replay.
- AGS exposes paginated/filterable line-item collection reads, single-item
  reads, create/update, and score submission with normative media types. A
  read-only token can list/read but cannot write. Line items preserve offset or
  blank/null optionals, `gradesReleased`, and qualified extensions; scores
  preserve clear (`null`) updates, scoring-user and submission metadata,
  sub-second timestamps (including the standard `+00` offset), progress enums,
  and qualified extensions. Query parameters on line-item IDs survive
  `/scores` URL derivation. Score state is stored by the mock service. Repeated writes
  remain repeated provider requests; Yawp-owned grade-job idempotency is
  deliberately implemented in #213 rather than attributed to a provider
  extension not required by the standard.
- The mock runs two registrations on one origin, binds OAuth assertions to the
  expected client and deployment, requires finite and fresh NumericDate claims
  plus bounded validity windows and non-empty OAuth assertion ids, fetches the
  tool signing key from Yawp's real loopback JWKS endpoint, expires bearer
  grants on a controllable clock, rejects cross-registration use, and validates
  provider requests independently from Yawp schemas.
- Seeded controls can force 401, 403, 429, 500, redirect, timeout, malformed
  JSON, invalid HTTP status, invalid media type, invalid context, and
  cross-origin resource responses.

The mock records a redacted request journal for assertions. It never stores
raw private keys, client assertions, bearer tokens, or launch JWTs in the
journal.

## Deterministic seed

The reference world is `blackboard-reference`:

- issuer: `https://blackboard.com` in the real provider profile and the mock's
  loopback issuer in executable tests;
- client: `yawp-summer-client`;
- deployment: `deployment-blackboard-001`;
- course/context: `course-eng-101`, English Composition I;
- resource link: `resource-argument-essay-001`;
- instructor: `lti-instructor-kevin`;
- learners: `lti-learner-ada`, `lti-learner-james`, and an inactive learner;
- content item: a Yawp argument-essay assignment link;
- line item: `lineitem-argument-essay-001`, 100 points;
- fixed timestamps and RSA signing keys reserved exclusively for tests.

Flows may create new line items and scores in the mock's in-memory store, but
the starting state and identifiers remain deterministic.

## Adapter boundary

The core owns claim validation, endpoint policy, JWT work, OAuth client
assertions, and normalized LTI values. A provider adapter may only supply or
normalize documented registration metadata and known interoperability quirks.
It may not weaken signature, nonce, tenant, deployment, audience, scope, or URL
validation.

The Blackboard reference profile captures its fixed issuer, documented OAuth
token endpoint, and registration guidance. No Blackboard-only branching is
permitted in core verification.

## Workflow and data mapping

Opaque platform identifiers are namespaced by the registration. No email,
display name, course label, or mutable title is used as an identity key.

| LTI boundary | Yawp-owned mapping | Tenant and lifecycle rule |
| --- | --- | --- |
| `iss` + client/deployment registration | LMS registration row | Exactly one organization; disabled by default; disabled/uninstalled registrations reject before network access |
| `sub` | External LMS identity bound to a Yawp account | Unique within registration; email is optional profile data only; explicit first-launch account-binding policy belongs to #212 |
| Context `id` | LMS course context mapped to a Yawp class | Unique within registration; every NRPS page must repeat the signed context id |
| Resource-link `id` | LMS placement mapped to a Yawp assignment | Unique within registration and context; target link must match the initiated transaction |
| NRPS member `user_id` | External identity and class-enrollment membership | Reconcile active/inactive/deleted status without assuming PII is present; minimize stored person fields per institutional approval |
| Deep Linking content-item URL + custom data | Yawp assignment selected for placement | Signed response returns only advertised item/presentation capabilities, a fresh nonce, and the platform's opaque `data` when present |
| AGS line-item `id` | External grade-column binding | Validate returned URL against the exact advertised service origin, even when another origin is registration-allowlisted; preserve immutable identity on update |
| AGS score `userId` | External learner identity on a released Yawp submission | #213 gates on tenant, enrollment, release state, and a durable Yawp grade job before any provider write |

## Audit and data handling contract

The persistence issues (#212 and #213) must emit structured events for
`lti.launch.accepted`, `lti.launch.rejected`, `lti.identity.bound`,
`lti.roster.sync.started`, `lti.roster.sync.completed`,
`lti.roster.sync.failed`, `lti.deep_link.completed`,
`lti.grade_passback.queued`, `lti.grade_passback.sent`, and
`lti.grade_passback.failed`. Events identify the Yawp organization,
registration, context/resource mapping, actor or job, outcome, and safe provider
status/retry metadata.

Audit and diagnostic records never contain bearer tokens, private keys, client
assertions, full launch JWTs, raw authorization headers, or full request/response
bodies. Person attributes are omitted unless needed for the approved workflow;
opaque subject/user ids are preferred. Institutional retention and deletion
periods are a human approval marker before a live pilot, while uninstall must
immediately disable network access and credential use.

## Rollout transitions

The integration remains default-off. The only permitted progression is:

1. deterministic local network proof against the provider-shaped mock;
2. institution-owned sandbox interoperability after security/data approval;
3. named pilot organization enabled behind an organization-scoped feature flag;
4. monitored pilot with explicit rollback/uninstall proof;
5. broader availability only after pilot evidence and a separate approval.

No stage changes automatically because local tests pass.

## Issue boundaries

- #211 delivers the typed contract, official-source decision record,
  Blackboard reference profile, deterministic network platform, contract
  parser/verifier, and executable end-to-end spike.
- #212 consumes this boundary in public OIDC initiation/callback routes, adds
  tenant-bound persistence, one-time state/nonce handling, account binding,
  feature flags, audit, diagnostics, and uninstall behavior.
- #213 consumes the already-frozen OAuth, NRPS, Deep Linking, and AGS mock
  surfaces to ship the instructor and grade workflows.

## Threat model

Primary threats are token forgery, algorithm confusion, remote key injection,
SSRF through registration or launch claims, cross-organization registration
selection, deployment confusion, replay, account takeover through email,
over-broad service scopes, grade changes before release, retry duplication, and
credential leakage in logs.

The contract therefore fail-closes unknown issuers/deployments and disabled
registrations before network I/O, binds every launch and client assertion to
registration metadata before disclosing credentials, ignores untrusted key
URLs in JOSE headers, pins vetted DNS answers into sockets, blocks redirects and
non-public network targets (including mapped/translated IPv6), validates
returned resources against the exact source-service origin, carries bearer
tokens only in tenant/deployment/scope/expiry-bound grants fingerprinted to the
immutable registration endpoints and allowlists, preserves opaque
platform ids, requests least-privilege scopes, and redacts security material
from diagnostic output. Persistence-level launch replay, tenant, release, and
audit guarantees are completed in #212 and #213.

## Alternatives considered

1. Build a Blackboard-only integration. Rejected because pilot evidence is not
   final and the LTI standard provides a safer portable contract.
2. Build Canvas, Blackboard, PowerSchool, Google Classroom, and Blackbaud at
   once. Rejected because the named products do not share one integration model
   and this would dilute the summer critical path.
3. Mock provider SDK modules or stub `fetch`. Rejected because it cannot prove
   request serialization, headers, redirects, status handling, pagination, or
   provider-shaped failures.
4. Depend on a vendor sandbox for CI. Rejected as the primary gate because
   credentials, uptime, rate limits, and mutable tenant data would make proof
   incomplete and nondeterministic. A sandbox remains a later interoperability
   confirmation layer.

## Human review markers

- Confirm the named pilot institution and whether its product is Blackboard
  Learn or Blackbaud; the current notes contain both names.
- Confirm Blackboard deployment model/version, sandbox owner, admin contact,
  procurement/security-review timing, and institutional data-sharing policy.
- Approve requested person fields and scopes before any live registration.
- Approve external sandbox communication, credentials, push, merge, deploy,
  migration, and production smoke separately.

These markers do not block code, local network proof, or later summer issue
implementation.
