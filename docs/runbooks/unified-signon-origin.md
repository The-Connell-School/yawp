# Unified sign-on public origin behind preview ingress

The fast preview runtime receives HTTP after ingress terminates TLS. Ingress
preserves the selected public Host and replaces incoming `X-Forwarded-Host`,
`X-Forwarded-Proto` and `X-Forwarded-Port` (`scripts/preview/ingress-server.mjs`,
`forwardedHeaders`). Vite's pinned `@remix-run/node-fetch-server` adapter builds
`request.url` from the socket protocol and Host; it does not consume these
forwarding headers. Thus a browser at `https://pr-565.preview.yawp.school`
submits an HTTPS Origin while the action sees
`http://pr-565.preview.yawp.school/auth/login.data`.

`render-compose.mjs` supplies `YAWP_ENVIRONMENT=preview` and a server-controlled
`PRIMARY_APP_URL`. Unified sign-on compares against that configured HTTPS
origin only when its host, including any non-default port, exactly equals the
HTTP request URL's host. Invalid configuration, embedded credentials, another
host, or a different environment cannot expand the origin set. No forwarding
header or supplied Origin is used to construct an accepted origin. The HTTP scheme of the internal hop cannot authorize a public HTTP Origin.
Direct same-origin behavior outside that configured proxy host and missing-Origin
behavior are retained. Google authorization
uses the same public origin for its callback URL, preserving HTTPS after TLS
termination. Missing Google configuration still returns 503 before provider
contact. The guard is reached only after the existing sign-on flag dispatch;
legacy routes and the default-OFF policy are unchanged.

## Local verification

FAILURES.md slug: `di-signon-fix-preview-origin`. Hosted before evidence belongs
to QA target #565 at `deda27e41c68adb071d74d588127b1ee7c3a77d9`, recorded in the
lane's `shots/di-signon-hosted-qa/RESULTS.md`. This fix does not operate #565.

The dispatcher regression models the observed public host/HTTPS Origin and the
adapter's HTTP URL. A local TLS proxy additionally reproduces the issue through
the real Vite adapter, normal browser submissions and disposable PostgreSQL at
1280px and 390px. The proxy overwrites forwarding headers as ingress does; it
never alters Origin. Before the fix, resolver and Google starts return 403.
Afterward, email and class resolution advance, the class-code action advances,
and unconfigured Google returns its expected 503. React Router independently
rejects foreign document POSTs with 400 before the application guard; direct
dispatcher regressions assert the application's 403 rejection.

Run the focused browser file with `playwright.unified-backend.config.ts`,
`--workers=1`, and `SIGNON_ORIGIN_LOCAL=1`. Supply a loopback
`SIGNON_ORIGIN_URL`, `SIGNON_UPSTREAM_URL`, local `E2E_DATABASE_URL`, temporary
`SIGNON_TLS_KEY`/`SIGNON_TLS_CERT`, and the same `PRIMARY_APP_URL` to the local
app server. `SIGNON_ORIGIN_BEFORE=1` records the known failure on the unmodified
baseline. Keep certificates, browser output and runtime caches in the lane's
`TMPDIR`; stop the app server afterward. No mail or live provider is needed.

These local results do not prove hosted success. Independent driver Ship Review,
merge, and the separate authorized #565 QA cycle remain required. Typography,
private OTP retrieval and hosted fixtures are separate tasks.
