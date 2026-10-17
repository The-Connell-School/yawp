# Private sign-in code capture for isolated PR QA

Normal unified sign-on code issuance captures its actual code before the mail
provider on eligible previews, in both development and production runtimes.
No email is sent on that path. Capture and retrieval require all of:

- `YAWP_ENVIRONMENT=preview`.
- The deployment is not the shared renderer's `PREVIEW_SLUG=demo` target.
- A valid PostgreSQL `DATABASE_URL` whose database passes
  `isYawpPrPreviewDatabase` (`yawp_pr_N`); missing/malformed URLs, local hosts,
  demo and production databases are rejected. Connection target query overrides
  (`host`, `hostaddr`, `port`, `connectionString`) are rejected, including encoded
  or duplicate keys. Set the host and port in the URL authority instead. Ordinary
  `schema` and `sslmode` options remain supported.
- The existing server-side `PREVIEW_ACCESS_SECRET` (at least 32 characters),
  already forwarded by the preview compose renderer. No new secret is needed.

`POST /api/preview/qa/signon-code` authenticates `Authorization: Bearer
<PREVIEW_ACCESS_SECRET>` using a constant-time digest comparison. The body is
JSON: `{"email":"<intended-recipient>"}`. Never put credentials, recipients or
codes in query strings. Human seat codes, app sessions, master access codes and
the app's session signing secret do not authenticate this endpoint. It performs
its own checks before reading any body/capture; it needs no human preview cookie.

GET always returns 404. POST returns 404 outside the allowed deployment (including
demo and production even with valid credentials), 401 for bad/missing credentials
on an eligible deployment, 400 for invalid input, or 404 when no live capture
exists. Successful responses contain `{"code":"<one-time-code>"}`. Every response
uses `Cache-Control: private, no-store`.

Use the response only inside a private QA harness, for example:

```ts
const response = await fetch(`${process.env.QA_PREVIEW_ORIGIN}/api/preview/qa/signon-code`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.PREVIEW_ACCESS_SECRET}`,
  },
  body: JSON.stringify({ email: process.env.QA_RECIPIENT }),
});
if (!response.ok) throw new Error('Private code capture unavailable');
const { code } = await response.json();
// Pass code to the existing sign-in verifier. Never print it or capture it.
```

Obtain the existing preview access secret through the authorized private runtime
configuration. Do not create or rotate credentials. Keep request headers/bodies,
response bodies and filled code fields out of traces, screenshots, general logs,
PR bodies and public evidence. Record only sanitized status/assertion results.
Do not visit, deploy or wake previews without the task's explicit authorization.

Storage is process-local memory, limited to 500 recipients, scoped to the database
URL and configured secret. The latest delivery replaces that recipient's previous
capture. Reads consume a capture. Unread captures become inaccessible after ten
minutes; expired entries are pruned on the next capture/read, and restart discards
all entries. If restarted, request another code using the normal resend flow after
its cooldown. Multi-process deployments would need shared private storage; today's
preview web service has one process. Capturing is delivery only: the normal flow
still stores a hash, verifies expiry/context, applies rate limits and consumes
the challenge once. Reading a capture does not establish authentication.

Invalid preview configuration fails delivery closed without a provider fallback.
Local file capture, the unified feature flag and normal demo/production delivery
logic are otherwise unchanged. This adds no migration, deployment configuration
or flag override, and makes no demo/production flag changes.

Verify locally with `CI=1 ./bin/project test --profile unified-signon-preview-otp
--json`. After CLI bootstrap, add `SIGNON_LOCAL_TEST=1` for the existing real-DB
sign-on regression and the private-capture verifier scenario. That scenario uses
the isolated local Prisma connection and simulates preview metadata for the
capture gate; it never contacts a deployed database or mail provider.
