# Playwright Server Isolation Design

Date: 2026-07-21
Issue: #217

## Problem

The local Playwright configuration reuses any process responding on
`127.0.0.1:5173`. During #209 verification, that port belonged to the Golden
Triangle Singers Vite server, so Yawp tests navigated through and audited the
wrong application. A green or red result from that configuration is not
trustworthy.

## Considered approaches

1. Probe an existing server for a Yawp-specific marker before reuse. This would
   avoid the immediate false target but still depends on mutable, potentially
   stale application state and does not prove the test server matches the
   current checkout.
2. Kill whatever owns port 5173 before each run. This is destructive to other
   workspaces and violates isolation.
3. **Selected:** never reuse an existing server and allow the caller to choose
   an isolated `E2E_PORT`. Derive one loopback base URL from that port and use it
   for Playwright navigation, web-server readiness, and the spawned React Router
   command.

## Contract

- `E2E_PORT` defaults to `5173` for backward compatibility.
- The value must be an integer from 1 through 65535; invalid values fail while
  loading the configuration.
- Navigation and web-server readiness use exactly
  `http://127.0.0.1:${E2E_PORT}`.
- The spawned Yawp server receives the same port and keeps `--strictPort`.
- `reuseExistingServer` is always false. A collision on the selected port must
  fail explicitly.
- This changes only test tooling. No production route, loader, action, model,
  or UI behavior changes.

## Proof

- A deployment-contract test first fails against the old hard-coded/reuse
  configuration.
- With the unrelated site still listening on 5173, Yawp tests pass under
  `E2E_PORT=5174` and generated E2E context exists.
- A default-port test attempts 5173 and fails with a port-in-use error instead
  of running assertions against the unrelated site.
