# Internal platform integration

## Implemented: user directory

`GET /api/internal/v1/users` and `GET /api/internal/v1/users/:id` accept a backend-only Bearer `YAWP_MANAGEMENT_SERVICE_KEY`. Use the matching outbound key configured in Yawp Internal. The key must be a generated 32-byte base64url credential; it is not a member login token. No key leaves the handlers disabled (404). Invalid credentials return 401 before database access. Store the credential in managed secrets; omit Authorization headers from ingress and application logs. Deployment and real credentials have not been configured.

Search accepts `q`, optional `organizationId`, `limit` (1–50, default 50), and `cursor`. It searches active memberships by user name or email. Organization filtering happens before pagination. Each result contains `{ id, organizationId, displayName, email, privileged }`. A user with several memberships can appear once per organization. The cursor is bound to the query and organization. Responses are no-store.

Lookup returns `{ id, organizationId, privileged }` for an active membership. Either `isAdmin` or `isSuperAdmin` makes a user privileged. Missing users/memberships return 404. When a user has multiple active memberships, callers must pass `organizationId`; an ambiguous lookup returns 409. Internal's impersonation form, API, CLI/MCP and adapter now carry the selected organization to this endpoint.

These directory endpoints do not establish login sessions. The separate, opt-in browser integration below establishes attributed sessions. Ordinary app authentication remains available.

## Attributed session lifecycle

`InternalImpersonationClient` implements the existing Internal redeem/context/end service protocol. It accepts only a plain HTTPS origin and a backend credential, disables redirects, sets a 10-second deadline, validates returned identities and at-most-one-hour lifetimes, and never retries a consumed link. It accepts Internal's 204 response to end. No HTTP route or ordinary app login is activated by this client.

`InternalImpersonationSessions` persists a separate session tied to operator, assumed user, selected organization, and active membership. Only a SHA-256 hash of its random 32-byte browser credential is stored. The initial magic-link token is never stored in Yawp. Both administrator flags make a target ineligible.

Resolving a session revalidates with Internal on every call, compares the full identity and original expiration, then checks the local session and membership again. Revocation, upstream failure, target privilege changes, membership deactivation and local termination deny access. There is no authorization-cache fallback.

Session start/end and their attribution events use one database transaction. Deferred database guards reject lifecycle changes without matching audit. Attribution and lifetime cannot be changed; ended sessions cannot reopen. Audit rows reject UPDATE/DELETE and retain identity snapshots without cascading user relations. Database owners still control schema/trigger administration; deployment must restrict the application database role accordingly.

Exit first ends local access. If Internal cannot be reached, remote termination remains durably pending. `flushPendingEnds` attempts up to 20 pending terminations; it still needs scheduling. A consumed grant that fails local creation is ended upstream on a best-effort basis; it never becomes an ordinary session.

Validation:

```sh
./bin/project test --profile internal-impersonation --json
./bin/project test --profile internal-impersonation-integration --json
```

The latter uses the isolated worktree database, restores any temporary teacher/membership flags, removes its session records, and retains synthetic append-only audit events. The remote service is a controlled test double. HTTP and application-action audit are implemented as described below. Durable cross-process job propagation and end-retry scheduling remain unfinished. Production activation is not verified.

Validation commands:

```sh
./bin/project test --profile internal-management --json
./bin/project test --profile internal-directory-integration --json
./bin/project test --profile typecheck --json
```

The integration profile uses only the worktree's local seeded database and makes no data mutations. The focused suite tests credential rejection before queries, bounded organization filtering, cursor scope, privilege flags, and ambiguous lookup.

## Application mutation auditing

The shared application Prisma client now supports `runWithImpersonation` scopes. Ordinary requests retain normal behavior. In an attributed scope, awaited queries execute in a database transaction carrying a transaction-local session ID and request/job metadata. Database triggers derive operator/user/organization from the persisted session and append one event for each inserted, updated or deleted row, including bulk operations and implicit Prisma join-table rows. Events contain table and primary/composite record keys, never copied row values.

`withImpersonationTransaction` checks session identity, expiry, local membership and privilege eligibility, then verifies that every application table has enabled audit and truncate guards. Future migrations must add those guards to new tables; missing coverage prevents impersonated writes rather than silently omitting audit. Truncation is blocked during impersonation and always blocked for the audit table. Ordinary local seed reset preserves the internal session/audit tables.

The facade supports normal awaited operations, callback transactions and Prisma array transactions. All writes and their audit events commit or roll back together. Transaction settings do not leak into pooled connections. Cached model methods still consult current attribution. Nested calls to the root `$transaction` inside an existing attributed transaction are rejected; helpers should use the transaction client already supplied to them.

Async descendants using the shared application client retain attribution after a response, regain remote authorization, and receive a request-tail job identifier. They start new transactions rather than reusing a completed transaction. This does not yet cover a durable job deserialized by another process or a worker that creates its own Prisma client; those producers/consumers still require explicit attribution propagation.

`./bin/project test --profile internal-impersonation-writes --json` verifies real Postgres row events, no row-value copying, atomic rollback, bulk/array/callback transactions, cached methods, pooled context isolation, successful post-response tails with exact actor/request/job attribution, revoked async tails, truncate rejection, uncovered-table rejection and seed-reset audit preservation. The seed-reset proof is rolled back to retain the local fixture.

### Current background-work boundary

A source inventory at this integration revision found no durable user-job producer or consumer in `services` or `packages`, no queue model in Prisma, and no queue runtime dependency or worker command in the web app package. AI grading in `api.domain.grade-essay-ai/route.ts` awaits its model call, database writes and Blackboard posting in the web process. The EventBridge-triggered `api.domain.retention/route.ts` is independently authenticated maintenance, not a continuation of a user's impersonated request.

Current in-process descendants are covered by the shared-client attribution above. This inventory is not a guarantee for future workers: introducing a separate process or durable queue must carry authenticated original operator, target, organization, session and operation identifiers, revalidate authorization before execution, and test attribution and revocation through the actual producer/consumer. AsyncLocalStorage does not cross that boundary. Do not treat a caller-supplied actor or job ID as authority.

## Browser integration (opt-in)

`INTERNAL_IMPERSONATION_ENABLED=true` enables `/auth/internal-impersonation#token=…`. The resource page strips the fragment before posting it with a signed CSRF challenge, avoiding token-bearing request URLs or app analytics. The handoff expires ordinary login/membership cookies and creates a separate HttpOnly session cookie with the original bounded expiry.

Configure server-only `YAWP_PUBLIC_ORIGIN` (canonical HTTPS application origin), `INTERNAL_PLATFORM_ORIGIN` (plain HTTPS Internal origin), and `YAWP_PRODUCTION_SERVICE_KEY` (outbound redeem/context/end credential). The outbound credential must differ from inbound `YAWP_MANAGEMENT_SERVICE_KEY`. Existing `SESSION_SECRET` signs cookies. Only non-production loopback app origins permit HTTP and non-Secure cookies; production cookies always require Secure. These settings are not exposed through `getEnv()`.

Root middleware validates the session before app loaders/actions, establishes request attribution and records request start/completion. Authentication helpers pin the assumed user and membership; the root membership list is limited to that membership. Alternate login, LTI, legacy impersonation, admin pages and organization switching are denied until exit. Invalid internal cookies never fall back to ordinary authentication. Unsafe methods require the canonical same origin. Authenticated pages use a same-origin referrer policy so native POST forms preserve Origin while cross-site referrers stay hidden; the token handoff retains no-referrer.

A fixed root banner shows the assumed account, operator and organization with an Exit button, including routes outside the normal app layout. Client PostHog initialization/provider are omitted for the impersonation session. Exit clears browser credentials and ends the local session before attempting remote termination. A revoked session receives an unavailable page with an exit form. Missing integration configuration fails closed; it does not silently sign in another user.

`./bin/project test --profile internal-impersonation-browser --json` starts the real app on the owned app port and uses its local fixture database. A temporary HTTPS authority simulates only the Internal protocol. Chromium verifies fragment removal, target identity/banner, authentication heartbeat, organization-switch denial, request/lifecycle audit attribution, exit and remote revocation. The server processes/certificate are removed afterward; synthetic append-only audit records remain. Stop an already-running owned dev server before this test. `internal-impersonation-http` covers CSRF/origin failures, invalid-cookie fallback prevention, unavailable audit and termination services, cookie replacement and response caching.

The local two-app pairing now verifies stored grant issuance, HTTPS browser login, token replay rejection, an actual profile mutation and its audit read through Internal, revocation and exit. HTTPS cookies are Secure even on local development origins. The deployed pairing and deployment configuration remain outstanding. Pending termination delivery now retries automatically; the paired test verifies recovery after an upstream outage. See Internal tests/pair/yawp.ts for the repeatable paired proof.

## Bootstrap recovery details

The recovered setup uses Bun 1.3.1's text `bun.lock`, migrated from the existing binary lock without refreshing dependencies. Frozen dependency validation runs once from the worktree root before configuration/database side effects. The application Dockerfile uses the same text lock. Preview fingerprints already support either lock format.

Resource names now use the exact worktree directory and a path hash rather than the shared parent directory. Record port overrides are honored on subsequent runs. A legacy shared-resource configuration receives newly named resources; the script does not remove its old database/volume. Record's initial failed execution receipt remains historical: subsequent project CLI bootstrap and fixture checks are separate repair evidence, not a rewrite of that receipt.

## Audit read API

`GET /api/internal/v1/impersonation-audit` uses the backend-only `YAWP_MANAGEMENT_SERVICE_KEY` and returns `{ events, nextCursor }`. Optional filters are `organizationId` and `sessionId`; `limit` defaults to 50 and is bounded to 1–100. Each event includes operator, assumed user, organization, session, action, resource type/key, request ID/action, optional job ID and timestamp. It never includes browser credentials, link tokens or copied resource contents.

Pages sort by creation time and ID descending. The cursor binds the organization/session filters and uses the immutable event ID as Prisma's database cursor, preserving PostgreSQL timestamp precision. Audit rows cannot be deleted through the application role. Internal must authorize the caller before this backend lookup and verify returned scope. The browser acceptance profile verifies the real HTTP endpoint against recorded local events, including one-row pagination and unauthenticated rejection.

## QA account lifecycle service (not exposed over HTTP yet)

`InternalQaAccounts` creates a bounded batch of 1–10 teacher/student accounts in one existing organization. Each receives a generated `@yawp.invalid` address and a QA-prefixed name, with no password, administrator/owner privilege, notification, or licensing bypass. These accounts are intended for authorized impersonation. Active role memberships are checked against the organization's seat limits under an organization row lock.

The caller supplies a UUID request ID, operator ID, organization, reason and desired names/roles. The service normalizes and hashes the request; concurrent retries serialize on that ID and return the same resources, while changed input rejects. Creation and immutable `InternalQaFixture` provenance commit together. The stored snapshot records the operator and exact user/membership IDs. Archive deactivates only those memberships in that organization and atomically records the cleanup operator/time; repeat archive preserves the first attribution. It does not delete users or customer resources.

The migration prevents changing/deleting provenance or reopening an archived fixture and preserves the new table during local seed resets. It installs the existing impersonation audit guards so schema coverage remains complete. `./bin/project test --profile internal-qa-integration --json` verifies real PostgreSQL concurrency, retry mismatch, scope, privilege absence, provenance immutability, seat rejection/rollback and non-destructive archive. Synthetic fixture history remains after the test. HTTP authorization and Internal UI/API/CLI/MCP orchestration still need wiring; this service is not enabled in production.

## Rubric promotion validation and remaining pinning

`validateRubricPromotion` is a strict, non-mutating validation boundary for future Internal content promotion. It returns normalized portable rubric content or field-addressed issues. It checks bounded JSON, category types/completeness/unique keys, finite nonnegative weights with positive total, reachable score steps, score-label values, non-overlapping proficiency bands, composite bounds and unknown fields. Legacy `parseRubricSchema` remains unchanged for stored-data compatibility. The dedicated `internal-content-validation` profile verifies all current starter definitions as well as malformed inputs.

Portable names preserve existing case and underscores, including `gba300-nonverbal-rubric-STUDENT`; transfer must not rename an existing rubric. Validation does not authorize an operation or certify dependencies, and no promotion endpoint invokes it yet.

The remaining storage/read integration must preserve assignment-specific grading before changing any library default. Current `Assignment` has no rubric revision field. `resolveAssignmentTypeGradingConfig` reads the current linked Rubric schema by assignment type; consumers include AI grading, submission rubric display and assignment insights (admin configuration intentionally reads the current type). Add immutable rubric revisions and assignment pinning with backward-compatible fallback, pass assignment context through those consumers, and test older and newly created assignments across a promotion. Do not implement promotion by overwriting the legacy Rubric row and assuming older assignments are pinned.

### Implemented rubric revision storage and reads

`InternalRubrics.inspect/publish` now provides a trusted local service for immutable publication, with exact expected-fingerprint checks and request-ID/input-hash retries. It validates incoming rubrics, records operator/reason with each immutable revision, and refuses changes to protected starter identities (copy to a new portable name instead). No HTTP endpoint exposes this service yet; backend authentication, role authority, source-revision metadata and Internal orchestration still need wiring.

First publication of an existing rubric captures its prior normalized schema and pins existing assignments before moving `Rubric.currentRevisionId`. Its legacy schema columns remain untouched. New assignments receive the current revision in a database trigger; rubric-row locking serializes creation against publication. Later publication retains all earlier pins. Assignment pins cannot be changed or cleared, and changing the assignment type of a pinned assignment is rejected. Revision history survives local fixture resets.

The current-revision pointer is the per-rubric opt-in: unpublished rubrics keep the legacy reading path. The grading resolver now accepts assignment context and uses its pinned revision. AI grading, submission display fallback and assignment insights pass that context. Existing grading-run display snapshots remain preferred; the separate current-setting grammar-highlighting toggle retains its prior behavior. The admin configuration path reads the current default. A rollback to old application code will read legacy columns rather than newer revisions, so do not publish until all relevant application replicas support revision reads.

`internal-rubrics-integration` verifies actual database publication/retry, old/new assignment resolution, immutable pins/history, stale-input rejection, protected-starter rejection and concurrent assignment creation. `internal-impersonation-writes` verifies the new table keeps audit coverage and seed-reset preservation intact. These are local tests, not deployed promotion evidence.

### Authenticated content API

`INTERNAL_CONTENT_ENABLED=true` opts in to `GET /api/internal/v1/rubrics?name=...`, `POST /api/internal/v1/rubrics/validate` and `POST /api/internal/v1/rubrics`. All require a separate backend-only `YAWP_CONTENT_SERVICE_KEY` (at least 43 URL-safe characters). Do not reuse the user-directory/QA management key or pass this key into preview feature processes. The deployment environment fixes the destination; these endpoints accept no caller-selected URL, environment or organization. These shared rubrics are not organization-scoped resources.

Inspection returns `{ rubric: null }` if absent, otherwise the current schema/fingerprint/version. Validation accepts `{ schema }` and returns either normalized content or field-addressed issues without writing. Publication requires `requestId`, trusted `actorId`, `reason`, `expectedFingerprint` (null only for a missing rubric), `schema`, and `source: { contentId, version, fingerprint }` identifying the exact Internal draft. Source metadata is stored in the immutable revision and covered by the retry hash. Baseline-capture rows and pre-existing revision history have null source metadata.

Bodies are streamed with a 300 KiB boundary limit; semantic rubric validation retains its 256 KiB document limit. Responses are non-cacheable. Disabled/unconfigured endpoints return 404; bad credentials 401, malformed envelopes 400, rubric issues 422, protected starter publication 403, and stale/conflicting retries 409. Infrastructure errors are sanitized. Internal must still authorize the initiating member/agent for the selected environment before calling this backend API. That Internal adapter and promotion workflow are not yet connected.

`internal-rubrics-http` checks credential/enablement, source requirements, field/query rejection, validation without mutation and payload/error boundaries. The real database integration now publishes through this authenticated handler and verifies retained source metadata, retries and assignment pins. No production service credential has been created and no endpoint deployed.

### Rubric catalog API and Internal rubric releases

The rubric manager in Yawp Internal v3 uses the catalog API under `/api/internal/v1/rubric-catalog`, authenticated with `Authorization: Bearer $YAWP_MANAGEMENT_SERVICE_KEY` (404 when the key is unset, 401 on a bad key, 405 on the wrong method, 400 on any query string or malformed body, bodies limited to 300 KiB, responses `no-store`, infrastructure errors sanitized to 503):

- `GET /api/internal/v1/rubric-catalog` lists library rubrics (`key` = `Rubric.name`) and per-type rubrics (`key` = `assignment-type:<typeId>`). Every rubric entry carries `release: { revisionId, version, fingerprint, releasedAt } | null`, the revision Yawp Internal released for that key.
- `GET /api/internal/v1/rubric-catalog/item?key=...` returns the live content, editable document, fingerprint and revision history. `rubric.release` is the same release object (or null) and each entry in `revisions` has `isReleased`.
- `POST /api/internal/v1/rubric-catalog/versions` (`save`) publishes to schools: it writes the live rubric row, appends a revision and moves the current pointer, so every new assignment pins to it.
- `POST /api/internal/v1/rubric-catalog/stage` appends a revision **without publishing it** and **releases** it for its key. Body (strict): `{ key, requestId (uuid), actorEmail, reason (3..500), document, source: { contentId (uuid), version (positive int), fingerprint (64 lowercase hex) } }`. The document is validated exactly like `save` (422 with field issues; library names are immutable) and stored the same way (prompt-config and top-level keys the editor does not own are kept from the live content). The new `RubricRevision` gets the next version for that rubric, `fingerprint` of the stored content, `createdBy = actorEmail`, `reason`, and `sourceContentId/sourceVersion/sourceFingerprint` from `source`. Before inserting it, stage runs the same first step as `save`: if no revision holds the live content it is captured as a `capture-before-edit` revision, a library rubric's `currentRevisionId` is pointed at that baseline (a per-type rubric's `AssignmentTypeRubricBaseline` likewise), and unpinned assignments of the rubric's types are pinned to it; the staged revision takes the next version. The live content (`Rubric.schemaJson`, `AssignmentType` grading columns) is never changed, so schools keep grading with the same content. Retries with the same `requestId` and inputs return the original revision with `replayed: true`; different inputs return 409. In the same transaction the new revision becomes the key's release: the platform table `RubricRelease(catalogKey, rubricRevisionId, releasedAt, releasedBy, requestId)` is upserted for the key. A replay never re-releases (a newer release stays in place) and returns the key's current release. Unknown key 404, read-only rubric 403. Response: `{ revision: { id, rubricName, version, createdBy, reason, createdAt, fingerprint }, replayed, release: { revisionId, version, releasedAt } | null }` (`release` is only null on a replay whose release was cleared).
- `POST /api/internal/v1/rubric-catalog/unrelease` withdraws a key's release. Body (strict): `{ key, actorEmail, reason (3..500) }`. Response: `{ key, cleared, previous: release | null }`; clearing a key with no release returns `cleared: false`. The revision and every assignment pinned to it are kept. Unknown key format 404.

Rollout (`internal_rubrics` feature flag, "Rubrics from Yawp Internal"): when `createAssignmentDeployedToClasses` creates an assignment without an explicit `rubricRevisionId`, it resolves the classes' school (`Class` → `School.organizationId`) before the transaction. If every class belongs to one organization and the flag is on for it (everyone, or targeted at that organization), the assignment pins to the `RubricRelease` revision for the assignment type's catalog key, using the same key the pin trigger accepts: the library rubric's `name` once it has a current revision, else `assignment-type:<typeId>` when the type has a per-type baseline. The release is used only when its revision belongs to that exact key; otherwise, and when the flag is off, there is no release, there are no classes, or the school/flag read fails (logged; it never blocks creation), the trigger's normal current-revision pin applies. Classes from several organizations cannot be deployed together (the quota guard refuses them), and the release lookup treats them as default. Existing assignments keep their pin; grading follows the pin. When an assignment is pinned to a revision with Internal source metadata, the grading resolver honors that content even for `thesis-driven-essay`, which otherwise always grades with the code default. Released revisions appear in catalog history and version counts. The flag defaults off; the demo seed (`seed-preview-seats`, seed data mode) creates it as everyone on demo without overwriting a later change. The former `INTERNAL_DEMO_RUBRICS_ENABLED` env var and the `internal.demo_orgs` / `internal.platform_demo_revisions` lookup were removed; the platform no longer reads Internal's schema.

## Deployment preflight and drain settings

Use `./bin/project internal-integration-config INPUT_JSON --json` to validate a proposed deployment and emit `variables`/`secrets` maps for review. This local command never calls AWS, fetches credentials or changes a service. The input requires exactly `internalOrigin`, `publicOrigin`, `managementSecretArn`, `productionSecretArn`, `issueSessions` and `deliverEnds`. Origins must be plain HTTPS; credential inputs must be distinct exact Secrets Manager ARNs. The command cannot prove that different secrets contain different values; credential provisioning must enforce that separately.

Generated variables are `INTERNAL_PLATFORM_ORIGIN`, `YAWP_PUBLIC_ORIGIN`, `INTERNAL_IMPERSONATION_ENABLED` and `INTERNAL_END_DELIVERY_ENABLED`. Generated secret mappings are `YAWP_MANAGEMENT_SERVICE_KEY` (Internal calls Yawp) and `YAWP_PRODUCTION_SERVICE_KEY` (Yawp calls Internal). Existing `INTERNAL_COMMAND_TOKEN` is unrelated and must not be repurposed. `YAWP_APP_ORIGIN` does not substitute for the required `YAWP_PUBLIC_ORIGIN`.

The production Terraform App Runner resource now merges these mappings and adds their exact ARNs to its instance role policy when `internal_platform_integration` is configured. A reviewed production plan remains necessary. Merge the settings into existing maps; never replace existing application environment or secrets. Secret values do not belong in plan input JSON, Git or transcripts.

Start with both booleans false while installing/migrating and checking connectivity. Activating session issuance requires `deliverEnds: true`. To stop new impersonations while retaining termination delivery, set `issueSessions: false, deliverEnds: true` and retain the origin/credential mappings. Keep delivery running until pending ends have drained; do not disable both as a blanket rollback. Existing impersonation cookies must continue to be handled by the fail-closed integration rather than reverting to ordinary user authentication.

The preflight tests cover activation/drain behavior and invalid configuration. They do not prove live secret permissions, service connectivity, migrations, production sessions or deployment. The actual public Internal origin and secret ARNs depend on foundation/application provisioning; no live integration settings were created here.


### Opt-in Terraform wiring

`infra/internal-integration.tf` accepts an optional `internal_platform_integration` object. Its fields are `internal_origin`, `public_origin`, `management_secret_arn`, `production_secret_arn`, `issue_sessions` and `deliver_ends`; the booleans default false. With the object omitted, the module emits empty maps/list, retaining existing service settings and secret permissions. The module creates no secrets or resources. App Runner waits for its existing instance policy to update before service configuration changes.

`./bin/project test --profile internal-integration-infra --json` runs real provider-free Terraform module plans for defaults, drain mode and rejected activation/credential/origin combinations. `internal-integration-infra-validate` initializes only local providers/modules with backend disabled, then validates the entire root. Neither profile applies AWS changes. Live production planning and both directional credential-value checks remain required. The separate Internal foundation plan/approval does not deploy this Yawp configuration.

### Full-root verification

Local provider initialization completed with the locked HashiCorp AWS 6.53.0 and Random 3.9.0 providers, followed by successful full-root validation. The earlier 120-second download timeout was resolved by allowing 600 seconds for local provider initialization; it did not require changing provider versions or production state.

`./bin/project test --profile internal-integration-infra-root --json` now passes three cases: unconfigured runtime preservation, actual App Runner activation mappings with existing session secret retained, and the generated instance IAM policy containing both exact integration secret references. AWS and Random are mocked throughout. The policy case uses a targeted mocked apply to resolve generated ARNs and inspect the policy; Terraform emits its standard targeting warnings, and mock teardown completes. This is neither a live AWS apply nor a complete production plan. Seven provider-free module cases cover activation, draining and invalid inputs separately. Broader application backend failures remain unresolved and are not superseded by infrastructure checks.


## Fresh database audit coverage proof

`./bin/project test --profile internal-fresh-migrations --json` creates a unique disposable database on the claimed workspace's loopback PostgreSQL host, applies the full migration history, and checks the exact enabled mutation/truncation triggers on every application table. It rejects non-local connection targets and never resets the workspace database. Cleanup drops only the database generated by that invocation.

At the reconciled shipping source, 124 migrations and all 84 audited tables pass. The proof includes DocumentImage, replays the catch-up migration with existing triggers, removes those two triggers only in the disposable database, reapplies the migration, and verifies complete coverage again. Existing upgraded-database tests separately prove attributed writes, rollback and pooled-connection context isolation. This is local migration evidence, not production activation or release readiness; the broad unit suite still has 23 unresolved failures.


## Reconciled regression controls (2026-09-12)

Integration source `42e6f5dc` has 2,635 passing, nine skipped, and nine failing
unit tests. Typechecking passes. These failures are retained, not waived or
rewritten to match current behavior.

A controlled run substituted only the grading route from shipping source
`0fb5d40436d71a6ace2a0ebf041c87def998daf6` into the reconciled capsule, ran
`./bin/project test --profile unit --json`, and restored the integration route
byte-for-byte in a `finally` block. The same eight grading failures persisted
(and the same editor hydration failure). This rules out the integration's added
`assignmentId` argument as the cause of those assertions. It is **not** a full
shipping-checkout baseline: dependencies, fixtures, and other modules remained
from the reconciled capsule.

Source comparison additionally confirms that `grading-assistant-invocation.ts`
is identical to the shipping source. The route calls
`compileGradingAssistantInvocation`, whose current inputs omit the assignment
prompt. The separately tested `buildGradingRequest` helper does include that
prompt, but the route does not use it. The eight failures cover assignment prompt
inclusion/absence, exact request composition, ACT configuration, strictness, and
Daily Pages scale/feedback. Changing the compiler to satisfy these assertions
would change grading behavior; do not treat that as a test-only repair or replace
the deployed template mechanism with the older helper without compatibility review.

The editor hydration test passes alone (one test, zero failures) using the same
project-owned runtime. For that diagnostic, only the package test selector was
changed temporarily and restored byte-for-byte afterward. In the broad run,
`app_.documents_.$id/route.test.ts` mocks `DocumentEditor` to render null; Bun's
module mocks persist across files. That is consistent with the hydration test's
empty render in the broad suite. A durable fix must isolate or restore the real
component without removing assertions about IndexedDB recovery and bridge timing.

Diagnostic outputs: `/tmp/yawp-shipping-grading-route-control.txt` and
`/tmp/yawp-hydration-isolated-control.txt`. These are local ephemeral transcripts;
this section preserves the conclusions and limitations. Both controls restored
a clean checkout. No credentials, production data, deployment configuration, or
cloud resources were changed. These results do not certify production readiness.


The subsequent isolation repair changes the route-loader test to stub only
`./document-editor/editor`, leaving the real `DocumentEditor` hydration boundary
available to its own test. The full unit run now passes that hydration test and
all loader tests: 2,636 pass, nine skip, eight fail (the same grading assertions),
8,031 assertions across 337 files. No application implementation or hydration
assertion changed. Output: `/tmp/yawp-hydration-leaf-proof.txt`.
