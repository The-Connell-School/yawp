# Isolated preview invitation resend

FAILURES.md slug: `di-signon-fix-preview-resend`.

The unified resend guard now admits the existing provider-free PR capture path.
It requires the fixture target contract: preview environment, seed mode, matching
PR slug/database/app role, no database-schema override, canonical URL on
`preview-postgres:5432`, supported generated password format, and the existing
preview capture predicate. SES, unknown providers and real Resend credentials
cannot use this exception. Unsupported preview configurations fail closed even
in a production Node runtime and cannot bypass it with a local capture directory.
The existing local-capture/development guard and demo/production paths remain.
Proof, browser-flow boundaries, application lookup, ownership, status checks,
feature gates and rate limits remain in their original handlers/helpers.

Use `./bin/project capabilities --json`, `doctor --json`, and a fresh isolated
CLI bootstrap with collision-free app/database ports. Point caches at lane-private
`TMPDIR`; use `CI=1` throughout. The browser configuration requires
`SIGNON_LOCAL_TEST=1`, loopback `E2E_DATABASE_URL`, no provider credentials or
`SIGNON_MAIL_CAPTURE_DIR`, private `SIGNON_RESEND_CAPTURE_DIR` below `TMPDIR`, and
local disposable values for `PREVIEW_ACCESS_SECRET`, `FREE_TIER_LINK_HMAC_SECRET`
and `PRIMARY_APP_URL`. Never use hosted credentials for this fixture.

From `services/web-app`, run the focused Bun files:

```sh
bun test app/domain/unified-signon/resend-mail.server.test.ts \
  app/domain/unified-signon/preview-code.server.test.ts \
  app/routes/auth.login/unified-dispatch.test.ts \
  app/utils/preview-email-capture.server.test.ts \
  app/domain/unified-signon/policy.test.ts
bun test app/domain/unified-signon/backend.real-db.integration.test.ts
bun x playwright test --config playwright.unified-resend.config.ts --workers=1
```

Run `./bin/project test --profile typecheck --json` at the root. The browser config
starts and stops its own local server. Its Vite observer only records mail inside
the existing accepted capture branch and throws before real provider transports.
It changes no application delivery decision. Private assertions verify actual
recipient/content, signature, persisted release token hash, purpose and application.
No captured payload, code, token or invitation link belongs in review artifacts.

The SENT browser case verifies anonymous proof cannot send an administrator
reminder. Real-handler database coverage verifies authenticated-owner delivery and
foreign/anonymous/ineligible/missing-application refusal. The retained dispatcher
maps the free-tier gate's thrown route data to a generic 503; this correction does
not change that existing response behavior.

See [validation and comparisons](../design/evidence/unified-signon-preview-resend/README.md).
The four baseline resend cases fail before this correction; all six final browser
cases pass. Six flag-OFF control pairs have zero changed pixels. The capture fixture
uses the real disposable database with simulated PR deployment metadata; it does
not establish a hosted QA pass. No migration, rollout, real email or hosted action
is part of this correction. Delete private captures/results/caches, generated
runtime files and the owned CLI database/container/volume after use.
