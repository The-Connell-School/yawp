Free-tier waitlist and acquisition tokens (backend)

Endpoints

- Public waitlist (no UI):
  - POST `/api/free-tier/waitlist`
    - JSON body: `{ name, email, gradeLevel, schoolName, location, middleName? }`
    - Validation: strict; `.max()` on all fields; body capped at 4 KiB (read with a streaming limit). `middleName` is a honeypot: if it is non-empty the request gets the normal `{ ok: true }` and nothing is stored.
    - Uniform response: new, duplicate and honeypot submissions all return the identical `{"ok":true}`. A resubmission for an existing email is a no-op (it never overwrites the applicant's details).
    - Rate limiting: the shared Postgres limiter (`enforceUnauthByIpAndTarget`, limits in `config/rate-limits.ts` → `unauth.freeTierWaitlist`: 60/min and 600/h per IP, 6/h per email). Every request counts. 429 carries `Retry-After`.
    - Client IP: the shared `getClientIp` helper (`utils/ip.server.ts`), which ignores forged `X-Forwarded-For` prefixes.

- Token redemption:
  - GET `/api/free-tier/token?token=…` → `{ valid: true, label }` or `{ valid: false, reason }`
  - POST `/api/free-tier/token`
    - JSON: `{ token, name, email, gradeLevel, schoolName, location }`
    - Success returns `{ ok: true, bypassWaitlist }` only: nothing about the application (id, status, whether the email existed) is returned.
    - On `bypassWaitlist=true` tokens: a new email becomes `INVITED` with `releasedAt`; an existing `LEAD` becomes `INVITED`. Applications already further along are never moved backwards or overwritten.
    - On regular tokens: a new email becomes a `LEAD` with `acquisitionTokenId`.
    - `maxUses`/expiry are enforced atomically in the claiming `UPDATE` (no overshoot under concurrency). The same email redeeming the same token again does not use another seat.
    - Tokens are stored hashed-only (`sha256`) and looked up by hash on a unique index (no secret-dependent comparison in app code).
    - Rate limited like the waitlist (`unauth.freeTierToken`); the GET validator has a per-token budget of 5000/h.

- Internal (api.internal.v1.*; Authorization: `Bearer $YAWP_MANAGEMENT_SERVICE_KEY`):
  - GET `/api/internal/v1/free-tier/applications?q=&status=&released=&cursor=&limit=`
    - Lists/filter applications; cursor-paginated; JSON.
  - POST `/api/internal/v1/free-tier/tokens`
    - JSON: `{ label, bypassWaitlist?, maxUses?, expiresAt?, count?, createdBy? }`
    - Returns plaintext tokens (hashed at rest).
  - POST `/api/internal/v1/free-tier/release`
    - JSON: `{ applicationIds: string[] }`
    - Batch-release `LEAD`s to `INVITED` with `releasedAt`, subject to the global cap. Serialized with a transaction-scoped advisory lock so concurrent batches cannot overshoot the cap. Response: `{ released, refused (eligible but over the cap), skipped (unknown / not a LEAD / duplicate id), cappedAt }`.
  - GET `/api/internal/v1/free-tier/export[?q&status&released]`
    - CSV export, at most 10,000 rows (`x-export-truncated: true` if more). Cells starting with `= + - @` are prefixed with `'` to defuse spreadsheet formulas.

State machine

- `LEAD → INVITED → ACCOUNT_CREATED → ADMIN_SUBMITTED → SENT → MANUAL_REVIEW → APPROVED`
- Rejections/expiry: `… → REJECTED | EXPIRED`
- Implemented in `app/domain/free-tier/state.ts` with guard helpers and tests.

Operational runbook

- Capacity
  - Global release cap (`FREE_TIER_RELEASE_CAP`, default 100) enforced at release-time against active applications (`INVITED` and beyond).
  - When the cap is reached, additional release requests are refused; increase via env or run subsequent batches later.
- Tokens
  - Create tokens per source (“NCTE 2026”). Store and transport only the plaintext response at creation time; hashed at rest.
  - QR codes point to the GET validation endpoint. Redemption is POST (never GET).
  - Expiry and `maxUses` are enforced; `uses` increments on successful redemption.
- Email
  - No emails are sent in this PR. A stub hook `sendFreeTierReleaseEmail` is exposed for the upcoming “you’ve been selected” message.
- Abuse and privacy
  - Waitlist POST is strictly validated, uniformly acknowledged, rate-limited (shared DB limiter) and includes a honeypot.
  - Client IP handling is the shared helper from PR #401. Tokens in `GET ?token=` URLs appear in access logs; they are hashed at rest but treat printed QR tokens as semi-public.
  - Rollback: revert the commit and redeploy. The migration is additive (two new tables, one enum) and nothing else reads them; leave the tables in place.
- Tests
  - Unit + DB-integration tests run in CI (`Prisma migrations` job) with `FREE_TIER_DB_TESTS=1`.

