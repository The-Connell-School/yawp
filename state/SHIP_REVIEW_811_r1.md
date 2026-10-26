# Independent Ship Review — PR #811 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/811 |
| Title | fix: redact toast/admin error.message leftovers (#8aa) |
| Branch | `cursor/redact-toast-admin-error-message-886b` |
| Base (live) | `065a4e3c8761b1a68a199ae875bbe03e5e731185` (#808 merge tip) |
| Reviewed head | `fc30382a73d975694042a8a32fee29d0030fed11` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-26 |

## Verdict

**SHIP** on head `fc30382a73d975694042a8a32fee29d0030fed11`.

## Freshness

GitHub `headRefOid` for PR #811 matches the requested review SHA `fc30382a73d975694042a8a32fee29d0030fed11`. Single commit on the branch (`fc30382a7`). Diff vs `origin/main`: **3 files**, **+28 / −6**. No head movement during review.

## Claimed change (verified)

Follow-up to the #8y/#8z error-redaction sweep (parent context: merged #808). This PR closes two **leftover** `error.message` leak paths called out for #8aa:

1. **Group provisioning toasts** — `GroupProvisioningError` in the class-assignment groups action now uses server-side `safeDomainErrorTextForClientResponse` (already imported; same helper as inline `GroupEditingError` responses in the same route).
2. **Admin AI evaluations** — client `setRunError` in `handleRunCase` / `handleRunAll` uses shared `getErrorMessage` with the existing user-facing fallbacks when the message is `Unknown Error`.
3. **Toast redaction canary** — new route test asserts sensitive substrings are stripped from provisioning error toast copy while teacher-safe validation text remains.

## Helper choice correctness

| Surface | Helper | Correct? |
| --- | --- | --- |
| Groups action (`GroupProvisioningError` → `redirectWithToast`) | `safeDomainErrorTextForClientResponse(error, 'Could not update groups.')` | **Yes** — server route; typed domain `Error`; matches #8z pattern (`redactFreeformMessage` on message, fallback if empty). Same module already used for `GroupEditingError` in this file. |
| Admin evals (`catch` → `setRunError`) | `getErrorMessage(error)` + preserve `'The benchmark case could not run.'` / `'The benchmark could not run.'` when result is `'Unknown Error'` | **Yes** — client-side fetch/catch path; `getErrorMessage` applies `uiSafeErrorText` → `redactFreeformMessage`. Replacing raw `error instanceof Error ? error.message : …` closes the leak for API `payload.message` thrown via `new Error(...)`. |

No misuse of `safeErrorTextForClientResponse` (fallback-only) on domain errors; no raw `error.message` remains in the touched catch blocks.

## Toast UX (teacher copy)

- Domain `GroupProvisioningError` messages are intentional teacher validation copy (e.g. “Groups have already been opened.”). `safeDomainErrorTextForClientResponse` only redacts sensitive **substrings** (tokens, emails, prisma noise); it does not replace whole messages with the generic fallback unless the message is empty after redaction.
- Existing test **“surfaces a provisioning refusal as an error toast”** still passes unchanged (still matches `/already been opened/`).
- New canary adds secrets to a message that already contains valid copy; post-redaction description still matches `/already been opened/` and omits `SECRET` and `teacher@school.edu`.

**No over-redaction** of normal teacher toast copy for the paths changed.

## Admin client path safety

- Errors originate from `runCase` (`fetch` + `throw new Error(payload.message ?? …)`). `getErrorMessage` redacts string/`Error.message` before UI display.
- Non-`Error` unknown shapes still log scalar-safe metadata and surface `'Unknown Error'`, which the handlers map back to the prior friendly benchmark strings — behavior preserved vs pre-change fallbacks.
- Admin-only route; no change to loader/action server responses or auth.

## Test quality

- **Strengths:** Integration-style route test hits the real action → toast path (not only the helper unit tests). Asserts both retention of business copy and absence of injected secrets. Aligns with existing `GroupProvisioningError` arrange tests in the same describe block.
- **Gap (non-blocking):** No new automated test for admin eval `setRunError`; coverage relies on existing `misc.test.ts` for `getErrorMessage` redaction. Acceptable for this small leftover fix given established helper tests and scope.

## Kevin / #608 untouched

PR #811 diff is limited to:

- `services/web-app/app/routes/app.class-assignments.$classAssignmentId.groups/route.tsx`
- `services/web-app/app/routes/app.class-assignments.$classAssignmentId.groups/route.test.ts`
- `services/web-app/app/routes/app.admin.ai-evaluations._index/route.tsx`

No overlap with open platform preview PR **#608** (`platform-enhancements` flag work) or other Kevin/Bryant platform surfaces. No Terraform, flags, schema, or unrelated product edits.

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| — | — | None blocking. |

**Observations (informational):**

- `GroupProvisioningError` toast path was the only remaining raw `error.message` in this route’s provisioning catch; inline `GroupEditingError` was already redacted — this change completes consistency within the file.
- Other app routes may still use raw `error.message` for **intentional** domain string checks (e.g. free-tier copy guards); out of scope for #811.

## Verification

Local (detached at `fc30382a73d975694042a8a32fee29d0030fed11`):

```text
/home/ubuntu/.bun/bin/bun test \
  app/routes/app.class-assignments.$classAssignmentId.groups/route.test.ts
# 32 pass, 0 fail (includes new redaction canary)
```

GitHub Actions for PR #811 at review time: **Changed paths** and **Preview tooling** SUCCESS; migration integration SUCCESS; additional CI jobs still running — no diff-introduced TypeScript or scope issues identified.

## Blockers

None.

## Recommendation

**Merge PR #811** when required CI is green. This review did not modify application code on the feature branch; artifact only.
