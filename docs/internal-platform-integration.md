# Internal platform integration

## Implemented: user directory

`GET /api/internal/v1/users` and `GET /api/internal/v1/users/:id` accept a backend-only Bearer `YAWP_MANAGEMENT_SERVICE_KEY`. Use the matching outbound key configured in Yawp Internal. The key must be a generated 32-byte base64url credential; it is not a member login token. No key leaves the handlers disabled (404). Invalid credentials return 401 before database access. Store the credential in managed secrets; omit Authorization headers from ingress and application logs. Deployment and real credentials have not been configured.

Search accepts `q`, optional `organizationId`, `limit` (1–50, default 50), and `cursor`. It searches active memberships by user name or email. Organization filtering happens before pagination. Each result contains `{ id, organizationId, displayName, email, privileged }`. A user with several memberships can appear once per organization. The cursor is bound to the query and organization. Responses are no-store.

Lookup returns `{ id, organizationId, privileged }` for an active membership. Either `isAdmin` or `isSuperAdmin` makes a user privileged. Missing users/memberships return 404. When a user has multiple active memberships, callers must pass `organizationId`; an ambiguous lookup returns 409. Internal's impersonation form/adapter must carry the selected organization to this endpoint before enabling multi-organization impersonation.

These endpoints do not establish login sessions. The fragment-token handoff, attributed session, persistent banner/exit, per-request revalidation, mutation audit, and background-job attribution still need implementation. Existing app authentication is unchanged.

## Attributed session lifecycle

`InternalImpersonationClient` implements the existing Internal redeem/context/end service protocol. It accepts only a plain HTTPS origin and a backend credential, disables redirects, sets a 10-second deadline, validates returned identities and at-most-one-hour lifetimes, and never retries a consumed link. It accepts Internal's 204 response to end. No HTTP route or ordinary app login is activated by this client.

`InternalImpersonationSessions` persists a separate session tied to operator, assumed user, selected organization, and active membership. Only a SHA-256 hash of its random 32-byte browser credential is stored. The initial magic-link token is never stored in Yawp. Both administrator flags make a target ineligible.

Resolving a session revalidates with Internal on every call, compares the full identity and original expiration, then checks the local session and membership again. Revocation, upstream failure, target privilege changes, membership deactivation and local termination deny access. There is no authorization-cache fallback.

Session start/end and their attribution events use one database transaction. Deferred database guards reject lifecycle changes without matching audit. Attribution and lifetime cannot be changed; ended sessions cannot reopen. Audit rows reject UPDATE/DELETE and retain identity snapshots without cascading user relations. Database owners still control schema/trigger administration; deployment must restrict the application database role accordingly.

Exit first ends local access. If Internal cannot be reached, remote termination remains durably pending. `flushPendingEnds` attempts up to 20 pending terminations; it still needs scheduling when the HTTP integration is wired. A consumed grant that fails local creation is ended upstream on a best-effort basis; it never becomes an ordinary session.

Validation:

```sh
./bin/project test --profile internal-impersonation --json
./bin/project test --profile internal-impersonation-integration --json
```

The latter uses the isolated worktree database, restores any temporary teacher/membership flags, removes its session records, and retains synthetic append-only audit events. The remote service is a controlled test double. The HTTP handoff, cookie authentication middleware, always-visible banner/exit, application mutation auditing, job propagation and end-retry scheduling remain unfinished. Session-lifecycle audit is not yet application-action audit; do not activate production impersonation until that request boundary is wired and verified.

Validation commands:

```sh
./bin/project test --profile internal-management --json
./bin/project test --profile internal-directory-integration --json
./bin/project test --profile typecheck --json
```

The integration profile uses only the worktree's local seeded database and makes no data mutations. The focused suite tests credential rejection before queries, bounded organization filtering, cursor scope, privilege flags, and ambiguous lookup.

## Bootstrap recovery

The recovered setup uses Bun 1.3.1's text `bun.lock`, migrated from the existing binary lock without refreshing dependencies. Frozen dependency validation runs once from the worktree root before configuration/database side effects. The application Dockerfile uses the same text lock. Preview fingerprints already support either lock format.

Resource names now use the exact worktree directory and a path hash rather than the shared parent directory. Record port overrides are honored on subsequent runs. A legacy shared-resource configuration receives newly named resources; the script does not remove its old database/volume. Record's initial failed execution receipt remains historical: subsequent project CLI bootstrap and fixture checks are separate repair evidence, not a rewrite of that receipt.
