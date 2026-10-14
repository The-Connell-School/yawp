# PLAN: admin-migrate-4

- Keep all Free Trial mutations behind signed `/api/internal/v1/free-tier/...` endpoints with existing HMAC, operator attribution, audit, bounded CSV, and formula-safe export behavior.
- Do not add email behavior; preserve existing platform-side hooks called by the signed endpoints.
- Gate `/app/admin/free-tier` as moved so it is no longer the primary operator surface.
- Add focused platform tests for the moved legacy route and any touched signed endpoint behavior.
- Capture a local screenshot of the moved platform page after focused tests pass.
