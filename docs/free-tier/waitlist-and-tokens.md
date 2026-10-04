Free-tier waitlist and acquisition tokens (backend)

Endpoints

- Public waitlist (no UI):
  - POST `/api/free-tier/waitlist`
    - JSON body: `{ name, email, gradeLevel, schoolName, location, middleName? }`
    - Validation: strict; `.max()` on all fields; `middleName` is a honeypot (must be empty).
    - Uniform response: `{ ok: true }` (does not reveal whether the email exists).
    - Rate limiting: simple in-memory per-IP limiter (10 failures/10 min per client, global 200) modeled after `utils/preview-access-rate-limit.server.ts`.
    - Client IP: uses the last `X-Forwarded-For` hop; note that PR #401 changes the shared helper to the second-from-last — this code should switch to that helper when it lands.

- Token redemption:
  - GET `/api/free-tier/token?token=…` → `{ valid: true, label }` or `{ valid: false, reason }`
  - POST `/api/free-tier/token`
    - JSON: `{ token, name, email, gradeLevel, schoolName, location }`
    - On `bypassWaitlist=true` tokens: creates/advances an application to `INVITED` and sets `releasedAt`.
    - On regular tokens: creates/updates a `LEAD` application and records `acquisitionTokenId`.
    - Enforces expiry and `maxUses`; tokens are stored hashed-only (`sha256`).

- Internal (api.internal.v1.*; Authorization: `Bearer $YAWP_MANAGEMENT_SERVICE_KEY`):
  - GET `/api/internal/v1/free-tier/applications?q=&status=&released=&cursor=&limit=`
    - Lists/filter applications; cursor-paginated; JSON.
  - POST `/api/internal/v1/free-tier/tokens`
    - JSON: `{ label, bypassWaitlist?, maxUses?, expiresAt?, count?, createdBy? }`
    - Returns plaintext tokens (hashed at rest).
  - POST `/api/internal/v1/free-tier/release`
    - JSON: `{ applicationIds: string[] }`
    - Batch-release to `INVITED` with `releasedAt` subject to the global cap.
  - GET `/api/internal/v1/free-tier/export[?q&status&released]`
    - CSV export.

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
  - Waitlist POST is strictly validated, uniformly acknowledged, rate-limited, and includes a honeypot.
  - Client IP handling follows the existing preview limiter; switch to the shared helper from PR #401 when available.

