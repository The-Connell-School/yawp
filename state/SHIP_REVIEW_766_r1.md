# Independent Ship Review — PR #766 (r1)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/766 |
| Title | Quality sweep #8f: log redaction + safe PostHog exceptions |
| Branch | `cursor/quality-sweep-8f-log-redaction-70c9` |
| Base | `main` @ `485963ae86d2d965e4f7a30e5688b611efe4c8cc` |
| Reviewed head | `66893ea220acb70c4b872f36dd483c13c9d18e5e` |
| Reviewer | Independent Ship Review (Cloud Agent) |
| Date | 2026-10-25 |

## Verdict

**SHIP** on head `66893ea220acb70c4b872f36dd483c13c9d18e5e`.

## Freshness

GitHub `headRefOid` and local `origin/cursor/quality-sweep-8f-log-redaction-70c9` both resolve to `66893ea220acb70c4b872f36dd483c13c9d18e5e`. Base matches `485963ae…`. No freshness block.

## Scope (7 files, +110 / −5)

1. **Email redaction in freeform text** (`server-error-request-context.server.ts`): tighten the email detector so `/` is excluded from local/domain character classes, preventing scoped npm paths such as `node_modules/@react-router/dev/dist/vite.js` from being mistaken for emails and mangled by `redactEmailForLog`.
2. **PostHog server exceptions** (new `posthog-server-exception.server.ts`): route production `captureException` calls through `errorForPosthogCapture` / `capturePosthogServerException`, which rebuild a synthetic `Error` from `buildSafeErrorForLog` output (message, name, sanitized stack only).
3. **Call-site wiring**: `entry.server.tsx` (`handleError`) and `auth.login/login.server.ts` (login failure path).
4. **Grade-essay-ai Blackboard AGS mock passback**: replace raw `{ error }` in `console.warn` with `{ error: buildSafeErrorForLog(error) }` (two catch blocks).
5. **Tests**: unit coverage for node_modules stack preservation, PostHog sanitization, and existing redaction suite still passes.

## Correctness & safety

### Stack / email redaction

- Root cause is sound: the prior pattern `[^\s@]+@[^\s@]+\.[^\s@]+` could treat path segments before `@` (including slashes) as the “local part,” redacting real file paths in stacks and hurting debuggability while not improving privacy.
- Excluding `/` from local and domain classes is aligned with normal email syntax and with how stack frames are formatted; real addresses in messages (e.g. `teacher@school.edu`) still match and are redacted via existing tests.
- `buildSafeStackForLog` still runs frames through `redactFreeformMessage` after `sanitizeStackFrame`; the new test confirms `@scope/pkg` paths stay intact and do not produce `***@` artifacts.

### PostHog helper

- Reuses the canonical `buildSafeErrorForLog` pipeline already used for `console.error` in `handleError`, avoiding a second redaction dialect.
- Synthetic error construction avoids forwarding raw `Error.message`, nested causes with sensitive text, or Prisma validation bodies; Prisma paths fall back to `name` / `code` as in logs.
- Only two production `posthog.captureException` call sites existed on base; both are updated. No behavioral change when `posthog` is null (login still skips capture; `handleError` still rethrows when PostHog is unavailable in production).

### Grade-essay-ai logging

- Structured logging of a raw `Error` object can serialize non-enumerable or nested fields unpredictably; switching to the safe DTO matches the rest of the quality-sweep logging posture.

### Regressions considered

- **Under-redaction**: PostHog now receives sanitized errors only — intended improvement, not a regression.
- **Over-redaction**: Legitimate emails in messages remain covered by existing tests; path-like false positives in stacks are reduced, not increased.
- **Secret leakage**: No new logging of request bodies, headers, or credentials; changes are strictly error-path hardening.

## Verification

Ran at reviewed head (`66893ea22`):

```text
bun test app/services/posthog-server-exception.server.test.ts \
         app/utils/server-error-request-context.server.test.ts
# 13 pass, 0 fail

bun test app/routes/auth.login/login.server.test.ts
# 5 pass, 0 fail
```

(Full `./bin/project test --profile changed` was not used as the gate; targeted suites cover all touched behavior.)

## Nits (non-blocking)

- Consider a follow-up sweep for any client-side or other services PostHog `captureException` usage outside `services/web-app` if they exist in other packages (none found in this PR’s web-app grep on base).
- `errorForPosthogCapture` duplicates the first line of stack as `name: message` plus frame lines; acceptable for PostHog grouping but slightly redundant vs console logs.

## Recommendation

Approve and merge PR #766 when CI is green. This review does not modify application code on the feature branch.
