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

`./bin/project test --profile internal-impersonation-writes --json` verifies real Postgres row events, no row-value copying, atomic rollback, bulk/array/callback transactions, cached methods, pooled context isolation, revoked async tails, truncate rejection, uncovered-table rejection and seed-reset audit preservation. The seed-reset proof is rolled back to retain the local fixture.

## Browser integration (opt-in)

`INTERNAL_IMPERSONATION_ENABLED=true` enables `/auth/internal-impersonation#token=…`. The resource page strips the fragment before posting it with a signed CSRF challenge, avoiding token-bearing request URLs or app analytics. The handoff expires ordinary login/membership cookies and creates a separate HttpOnly session cookie with the original bounded expiry.

Configure server-only `YAWP_PUBLIC_ORIGIN` (canonical HTTPS application origin), `INTERNAL_PLATFORM_ORIGIN` (plain HTTPS Internal origin), and `YAWP_PRODUCTION_SERVICE_KEY` (outbound redeem/context/end credential). The outbound credential must differ from inbound `YAWP_MANAGEMENT_SERVICE_KEY`. Existing `SESSION_SECRET` signs cookies. Only non-production loopback app origins permit HTTP and non-Secure cookies; production cookies always require Secure. These settings are not exposed through `getEnv()`.

Root middleware validates the session before app loaders/actions, establishes request attribution and records request start/completion. Authentication helpers pin the assumed user and membership; the root membership list is limited to that membership. Alternate login, LTI, legacy impersonation, admin pages and organization switching are denied until exit. Invalid internal cookies never fall back to ordinary authentication. Unsafe methods require the canonical same origin. Authenticated pages use a same-origin referrer policy so native POST forms preserve Origin while cross-site referrers stay hidden; the token handoff retains no-referrer.

A fixed root banner shows the assumed account, operator and organization with an Exit button, including routes outside the normal app layout. Client PostHog initialization/provider are omitted for the impersonation session. Exit clears browser credentials and ends the local session before attempting remote termination. A revoked session receives an unavailable page with an exit form. Missing integration configuration fails closed; it does not silently sign in another user.

`./bin/project test --profile internal-impersonation-browser --json` starts the real app on the owned app port and uses its local fixture database. A temporary HTTPS authority simulates only the Internal protocol. Chromium verifies fragment removal, target identity/banner, authentication heartbeat, organization-switch denial, request/lifecycle audit attribution, exit and remote revocation. The server processes/certificate are removed afterward; synthetic append-only audit records remain. Stop an already-running owned dev server before this test. `internal-impersonation-http` covers CSRF/origin failures, invalid-cookie fallback prevention, unavailable audit and termination services, cookie replacement and response caching.

The local two-app pairing now verifies stored grant issuance, HTTPS browser login, token replay rejection, an actual profile mutation and its audit read through Internal, revocation and exit. HTTPS cookies are Secure even on local development origins. The deployed pairing, durable cross-process jobs, retry scheduling and deployment configuration remain outstanding. See Internal tests/pair/yawp.ts for the repeatable paired proof.

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
