# Free Tier Entitlements (F1)

Authoritative spec: `FREE_TIER_SPEC.md` v2 — see §5.1 (contents) and §5.3 (entitlement model). Decisions D15–D18 apply.

- Primitive: `Organization.plan` (default `SCHOOL`). Existing orgs remain unchanged (SCHOOL short-circuits all checks).
- Plans (initial): `SCHOOL`, `FREE_CLASSROOM`, `FOUNDING_FACULTY`, `CLASSROOM_LICENSE`.
- FREE_CLASSROOM caps:
  - Students: 35
  - Teachers: 1
  - Active classes: 1
  - Reporter: gated off
  - Class Insights: on
  - Lesson Planner quota: 4 (TODO: confirm exact count — spec §5.1 says “around 3–4”)

Module: `services/web-app/app/utils/entitlements.server.ts`
- Returns per-plan caps and feature booleans
- Predicates short-circuit to “allowed / current behavior” for `SCHOOL`
- Reporter gate consumes this module (`utils/reporter/reporter-access.server.ts`)

Out of scope for this PR: enforcing seat/class caps in routes; only the Reporter gate is wired now.


## Rollout, rollback and known gaps

- Every org-select that feeds reporter access goes through `membershipSelect` in `auth.server.ts` (typed, so dropping `plan` is a compile error). `getReporterAccess` is the only gate; `/app/reporter` and `/api/domain/reporter` both use it.
- Existing orgs: `plan` is `NOT NULL DEFAULT 'SCHOOL'`, so reporter behavior is unchanged until a plan is explicitly set.
- Rollback: revert the commit and redeploy. The enum and columns are additive and ignored by older code; leave them in place.
- Not part of F1: the teacher sidebar link and the class-page growth-plan link still render for FREE_CLASSROOM orgs (the route itself redirects/404s). Hide them when the free tier ships.
