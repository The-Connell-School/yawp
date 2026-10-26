# Independent Ship Review — PR #816 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/816 |
| Title | fix: redact leftover error.message (#8ac) [skip preview] |
| Branch | `cursor/redact-error-message-8ac-9729` |
| Base (live) | `24fedfce61a2500865f6db9364bc55dfb0cf8c56` (#813 merge tip) |
| Reviewed head | `75299a7d133cf907374ec400661a12d0b3b759f9` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-26 |

## Verdict

**SHIP** on head `75299a7d133cf907374ec400661a12d0b3b759f9`.

## Freshness

GitHub `headRefOid` for PR #816 matches the requested review SHA `75299a7d133cf907374ec400661a12d0b3b759f9`. Single commit on the branch (`75299a7d1`). Diff vs `origin/main`: **6 files**, **+88 / −27**. No head movement during review.

## Claimed change (verified)

Quality **#8ac** closes **#813** out-of-scope leftovers. Author report vs actual diff:

| Claim | Verified |
| --- | --- |
| `internal-rubric-catalog-http.server.ts` — `failure()` uses `safeDomainErrorTextForClientResponse` for `CatalogError` JSON; status + `issues` preserved; canary for secrets/emails | **Yes** — import added; `failure()` wraps `error.message` through helper with fallback `'Rubric catalog request failed.'`; existing 422/404/403/409 behavior and `issues` unchanged. New canary in route tests strips `SECRET-TOKEN` and `admin@private.example.test` while keeping a non-empty `error`. |
| `email.server.ts` + `email-delivery-error.server.ts` — `safeEmailProviderErrorPayload` redacts SES/Resend error **return** payloads; no raw provider text/cause | **Yes** — new exported helper maps provider errors through existing `emailDeliveryDiagnostic` fixed prose. Resend success-path errors and unknown-body path return safe `{ name, message, statusCode }` only (no `cause`). SES `normalizeSesError` delegates to same helper; logs still call `emailDeliveryDiagnostic` on raw catch value (log payload already redacted). |
| Skipped as already clean: `dev-panel/*`, `domain/free-tier/email.server.ts`, `unified-signon/backend.server.ts` | **Confirmed** — none of these paths appear in the PR diff. |

## Helper choice soundness

| Surface | Helper | Correct? |
| --- | --- | --- |
| Internal rubric catalog HTTP (`CatalogError` → JSON `{ error, issues? }`) | `safeDomainErrorTextForClientResponse(error, 'Rubric catalog request failed.')` | **Yes** — server JSON for authenticated internal API; typed domain `Error`; same pattern as #808/#811. Redacts token/email substrings via `redactFreeformMessage`; preserves intentional copy such as `'Rubric validation failed'` and `'Unknown rubric'` (existing test unchanged). |
| `sendEmail` error return value (callers, not browser copy) | `safeEmailProviderErrorPayload(error, recipient)` → `emailDeliveryDiagnostic` | **Yes** — reuses the allowlisted-name + fixed-message policy already used for `console.error('email_delivery_failed', …)`. Avoids duplicating redaction rules and removes raw Resend/SES `message` and arbitrary `cause` from structured return values. Resend-specific friendly strings (`Provider restricts test recipients`, etc.) preserved via diagnostic classification. |

No use of `safeErrorTextForClientResponse` (fallback-only) where domain message redaction is required. No new raw `error.message` in client-bound JSON on touched surfaces.

## Intentional safe copy preserved

- Rubric catalog: validation and not-found strings without embedded secrets still pass through unchanged (`internal-rubric-catalog-http.server.test.ts` equality on `{ error: 'Rubric validation failed', issues }`).
- Email returns: Resend validation restriction maps to `'Provider restricts test recipients'` (test updated accordingly); SES/generic failures map to `'Provider error details redacted'` with stable `name` / `statusCode`.

## Test quality

- **Rubric catalog:** Canary extends existing domain-error integration test (real HTTP handler → JSON), asserting absence of injected secrets and presence of `error`.
- **Email:** Existing `sendEmail` tests updated for redacted messages; added `JSON.stringify(result).not.toContain(...)` guards on three failure paths; dedicated unit test for `safeEmailProviderErrorPayload`.
- **Gap (non-blocking):** No new test that SES log lines never contain raw AWS message text; reliance on pre-existing `emailDeliveryDiagnostic` test matrix (22 cases) plus sendEmail log assertions for event shape.

## Kevin / #608 untouched

PR #816 diff is limited to:

- `services/web-app/app/utils/internal-rubric-catalog-http.server.ts`
- `services/web-app/app/utils/internal-rubric-catalog-http.server.test.ts`
- `services/web-app/app/utils/email.server.ts`
- `services/web-app/app/utils/email.server.test.ts`
- `services/web-app/app/utils/email-delivery-error.server.ts`
- `services/web-app/app/utils/email-delivery-error.server.test.ts`

No overlap with open platform preview PR **#608** (`feat/platform-enhancements`, assignment-creation / guided-tour / platform-enhancements flag surfaces). No Terraform, schema migrations, feature flags, or unrelated product edits.

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| — | — | None blocking. |

**Observations (informational):**

- Commit message mentions rubric catalog only; PR title/body describe the full #8ac scope including email — cosmetic mismatch only.
- `CatalogError.issues` entries are still forwarded as-is (field validation messages); unchanged from pre-PR behavior and appropriate for internal operators.
- SES logging now passes the raw `catch` error into `emailDeliveryDiagnostic` instead of the normalized return object — improves classification input while log serialization remains redacted.

## Verification

Local (detached at `75299a7d133cf907374ec400661a12d0b3b759f9`):

```bash
cd services/web-app
/home/ubuntu/.bun/bin/bun test \
  app/utils/internal-rubric-catalog-http.server.test.ts \
  app/utils/email.server.test.ts \
  app/utils/email-delivery-error.server.test.ts \
  app/utils/server-error-request-context.server.test.ts
# 58 pass, 0 fail
```

Diff inspection:

```bash
git fetch origin main cursor/redact-error-message-8ac-9729
git diff origin/main...75299a7d133cf907374ec400661a12d0b3b759f9 --stat
```

GitHub Actions for PR #816 at review time: **Changed paths**, **Preview tooling**, and **Migration Integration** SUCCESS; TypeScript, E2E, and browser jobs still pending — no diff-introduced scope issues identified from changed-path signal.

## Blockers

None.

## Recommendation

**Merge PR #816** when required CI is green. This review did not modify application code on the feature branch; artifact only (`state/SHIP_REVIEW_816_r1.md`).
