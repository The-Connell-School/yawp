# Independent Ship Review — PR #752 (r1)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/752 |
| **Reviewed head** | `89ef9f2cdac0156a75854969b0bdf1a7ce24278b` |
| **Base** | `origin/main` (at review time) |
| **Reviewer** | Independent ship review (Cloud Agent) |
| **Verdict** | **SHIP** |

## Scope claimed vs diff

Diff vs `main` at the reviewed head: **7 files**, **+170 / −8** lines. Matches claimed scope:

| Area | Files |
| --- | --- |
| Slow Prisma query logging | `services/web-app/app/utils/prisma-query-log.server.ts`, `db.server.ts`, `prisma-query-log.server.test.ts` |
| Safe error text helper | `server-error-request-context.server.ts`, `server-error-request-context.server.test.ts` |
| Free-tier email redaction | `domain/free-tier/email.server.ts`, `email.server.test.ts` |

No other paths touched.

## Out-of-scope check

| Concern | Result |
| --- | --- |
| UI / routes / components (`.tsx`) | **None** in diff |
| Feature flags | **None** |
| Secrets / env / credential handling | **None** (uses existing `redactFreeformMessage` / `TOKEN_LIKE` patterns) |
| Kevin / #608 | **None** in changed files |

## Redaction — real, not cosmetic

### `summarizePrismaQueryForLog`

- Replaces **single-quoted SQL string literals** with `'[redacted]'` before logging.
- Runs **email-shaped tokens** through `redactEmailForLog` (partial mask, not deletion).
- Emits a **structured prefix** (`VERB Table1+Table2 Np | …`) so slow-query logs stay actionable without dumping bound values.
- Truncates snippets at 180 chars (tests assert ~280 char cap on full summary line including label).

**Ops signal retained:** statement verb, up to four quoted Prisma model/table names, distinct `$n` placeholder count, duration (unchanged in `db.server.ts`), and a redacted SQL outline.

**Residual risk (acceptable):** unquoted numeric or UUID literals embedded directly in SQL text (unusual for parameterized Prisma queries) would still appear in the snippet. Bound parameters remain `$n` only.

### `safeErrorTextForLog` / free-tier email paths

- New `safeErrorTextForLog` delegates to existing `buildSafeErrorForLog` → `redactFreeformMessage`, which already strips `token=` / `secret=` / `Bearer …` patterns and masks emails.
- **Provider error path:** `emailSendErrorMessage` now returns redacted text instead of raw `result.error.message` (fixes leakage via `{ ok: false, error }` and DB log rows).
- **Catch paths:** `sendFreeTierReleaseEmail`, `sendFreeTierAdminApprovalEmail`, and `sendFreeTierCongratulationsEmail` log and return `safeErrorTextForLog(error)` instead of raw `error.message`.

**Ops signal retained:** error **name**, non-sensitive message prefix (e.g. “delivery failed”), Prisma **codes** when applicable via `buildSafeErrorForLog` (unchanged behavior for Prisma errors).

**Not overly aggressive:** tests assert generic failure text like `delivery failed` remains while PII/tokens are removed.

## Tests run

From `services/web-app` with Bun 1.4.4:

```bash
bun test app/utils/prisma-query-log.server.test.ts \
  app/utils/server-error-request-context.server.test.ts \
  app/domain/free-tier/email.server.test.ts
```

**Result:** 24 pass, 0 fail (181 expect calls).

## Verdict rationale

**SHIP** — Redaction is implemented on meaningful leakage paths (raw slow-query SQL literals, free-tier email provider/catch errors), reuses battle-tested log sanitization, adds focused unit tests, and preserves enough structure for on-call debugging. No out-of-scope product changes detected.

## Actions

- **Do not merge PR #752 from this review branch** — this document is the only deliverable here.
- Merge decision for #752 remains with the normal Yawp! review / driver process after this record lands.
