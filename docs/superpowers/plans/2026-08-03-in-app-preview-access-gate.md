# In-app preview/demo access gate

Replace the Traefik HTTP Basic middleware with an access gate owned by the React Router
app: a branded access screen, memorable per-seat access codes, and a sign-out/switch
control inside the existing dev-login popover.

Applies to **preview and demo environments only**. Local development is unchanged.

## Why

Three problems with the Traefik gate:

1. **One shared password means one shared identity.** Everyone testing at once lands in
   the same accounts and the same org, so two testers collide on the same submissions and
   assignments.
2. **Native browser basic-auth modal.** Off-brand, and credentials are cached per origin,
   so switching identity means clearing browser credentials or opening incognito.
3. **Adding a tester is a deploy.** The htpasswd hash lives in a GitHub secret, so
   onboarding somebody mid-call is impossible.

An in-app gate fixes all three: the access code both authenticates *and* selects which
isolated seat you get, and it can be re-entered from inside the UI at any time.

## The invariant this change must not break

`services/web-app/app/utils/local-dev-auth.server.ts` gates the role-swap ("login as")
tools on `PREVIEW_ACCESS_GATE === 'on'`. That flag is emitted by the same
`render-compose` call that attaches the Traefik basic-auth middleware, so today the flag
**cannot** be set unless the gate is physically in front of the app.

That coupling is load-bearing. It was added to fix a real, confirmed vulnerability
(2026-07-30): anonymous `POST /auth/dev-login` against a public preview URL returned 302
with valid session cookies — passwordless admin impersonation on the open internet.

Removing Traefik removes that structural guarantee. The in-app gate must re-establish it:

- **Block data, not just pixels.** Traefik blocked at the entrypoint, so every loader,
  action, and API route was covered for free. The in-app gate must explicitly cover
  loaders, actions, and all `/api/*` routes. Rendering an access screen on the marketing
  route while `POST /auth/dev-login` still works is the exact bug being reintroduced.
- **Fail closed.** If no access codes are configured, every code is rejected and nothing
  is served. There is no "gate not configured, so allow" branch.
- **Production-dump data stays hard-off.** `PREVIEW_DATA_MODE === 'production-dump'`
  must continue to disable role-swap regardless of gate state.

Treat these three as acceptance criteria, not suggestions.

## Design

### Access codes

- Memorable, generated: two words plus a number, e.g. `brave-otter-4193`. Curated
  wordlist; no ambiguous or unfortunate pairings.
- One code per seat, generated at deploy/seed time and emitted in the deploy job output
  so they are retrievable without SSH.
- Entering a code does two jobs at once: it authenticates the visitor *and* binds them to
  a seat. This is the core of the design — one input, no second picker.

### Seats

A seat is a fully isolated demo world: its own org, its own teacher/admin/students, its
own classes, assignments, and submissions. Isolation must be at the **org** level —
separate user accounts inside one shared org still collide, because both testers are
grading the same submissions and editing the same assignments.

Note: the class-insights enablement script is per-org, so it must run for every seat.

#### One master seat by default; more on demand

Pre-seeding six seats was the wrong default. Most previews are looked at by one person,
or by several people who *want* to see the same thing, and six orgs is six times the seed
cost and five unused codes to explain.

So: every gated environment has exactly one **master seat**, a fixture in the codebase on
the existing `local-dev-org` — the seed data that is already there. Its code is supplied
per environment. A fresh preview has only this seat. Everyone who types the master code
shares one world, and sharing is a legitimate outcome, not a failure to isolate.

When somebody does want their own data, they create a seat from the admin UI: a control
beside "Create Organization", visible only when seat mode is on, which seeds a new org
from the same template and generates its access code. The code stays readable in the
organizations table afterwards so it can be shared later.

This is why the code can no longer live only in the environment: a seat created after
deploy has nowhere to be written. Seat codes therefore persist on the organization
(`previewSeatCode`), and resolution is master-from-environment plus
runtime-seats-from-database. Environments that already run pre-seeded seats have their
existing codes backfilled onto those rows, so no live code stops working.

Every seat gets the same personas the master seat has, platform admin included.
Withholding admin from later seats would remove the Admin surfaces — including the
control that creates seats — the moment a tester switched to one.

#### Every seat starts identical, then diverges permanently

All seats are seeded from the same template, so every tester begins from the exact same
world. From then on each seat is that person's own long-lived environment, and they are
expected to drift apart as people build in them. On demo especially, a seat may look
nothing like the seed template after a few weeks. **That divergence is the product, not
drift to be corrected.** Nothing may reconcile a seat back toward the template.

This makes seeding **create-only, and never destructive**:

- Seeding a seat that already exists is a no-op. It must not upsert, reconcile, top up,
  or "repair" the seat's data.
- A redeploy must therefore never disturb an existing seat's accumulated work. Demo is
  deployed repeatedly and is **not** reset — `reset_data` stays `false` in normal
  operation — so a seed step that reruns on deploy and rewrites rows would silently
  destroy somebody's demo prep. This is the single most likely way to get this wrong.
- Adding seat N+1 later seeds only the new seat and leaves seats 1…N untouched.
- Only two things may ever clear a seat: the explicit per-seat reset below, and the
  existing global `reset_data=true` dispatch input.

Preview environments are ephemeral and torn down with their PR, so they get this behavior
for free. Demo is the case that actually depends on it.

### Session

- Signed, httpOnly cookie, ~30 day expiry, scoped to the environment host.
- Distinct from the application's own auth session. Clearing the access cookie must not
  silently leave an app session valid.

### Sign out / switch

Bottom of the existing dev-login popover
(`services/web-app/app/components/local-dev-environment-bar.tsx`): show the current seat
and a sign-out control that clears the access cookie and returns to the access screen.

### Must stay open

`/api/healthcheck` — the deploy self-verify and container health polling both depend on
it. Everything else is closed by default.

## Surfaces to update

Removing Traefik basic auth touches deploy tooling that currently asserts it:

- `scripts/preview/render-compose.mjs` — attaches the middleware, emits
  `PREVIEW_ACCESS_GATE`
- `scripts/preview/deploy.sh`, `scripts/preview/bootstrap-host.sh`,
  `scripts/github-preview-config.sh`
- `scripts/preview/smoke-login.mjs` and `scripts/preview/smoke-login.test.js`
- `scripts/deployment-contract.test.ts`
- `.github/workflows/preview-environments.yml`, `.github/workflows/demo-environment.yml`
  — the self-verify step asserts anonymous 401 then authenticated 200/302/303; it must be
  rewritten to assert the new behavior (anonymous request gets the access screen and no
  app data; a code-bearing request gets the app)
- `docs/runbooks/preview.md`
- The transitional transport-gate secrets become unused

## Phasing

1. **Gate.** In-app access screen, code validation, cookie, full loader/action/API
   coverage, deploy tooling and smoke tests rewritten. Single-seat behavior — everyone
   who enters a code gets today's shared world. Ship this alone; it is the security
   surface and deserves its own review.
2. **Seats.** Parameterize the seed to emit N isolated orgs; bind code to seat; filter
   dev-login options to the seat.
3. **Polish.** Per-seat reset ("reset my seat" reseeds one org back to the template,
   instead of the current all-or-nothing `reset_data=true`), and seat occupancy ("in use
   2 min ago") so testers avoid each other without coordinating.

   Per-seat reset matters more than it looks. Because demo is never globally reset, it is
   the only way to recover a seat somebody has wrecked — today the sole remedy is
   `reset_data=true`, which wipes everyone. Treat it as required, not optional polish.

## Out of scope

- Local development behavior
- The demo box's current deployment (stays pinned; it is the static staging environment)
- Resetting demo data. Demo is long-lived by design and is not reset; `reset_data`
  remains `false` in normal operation.
- Anything in PR #229
