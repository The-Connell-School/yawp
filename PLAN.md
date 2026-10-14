# PLAN: admin-migrate-4

- Keep all Free Trial mutations behind signed `/api/internal/v1/free-tier/...` endpoints with existing HMAC, operator attribution, audit, bounded CSV, and formula-safe export behavior.
- Do not add email behavior; preserve existing platform-side hooks called by the signed endpoints.
- Gate `/app/admin/free-tier` as moved so it is no longer the primary operator surface.
- Add focused platform tests for the moved legacy route and any touched signed endpoint behavior.
- Address reviewer rejection by requiring HMAC for every mutating Free Trial internal API request, even when legacy bearer compatibility remains enabled for reads.
- Add focused tests proving valid legacy bearer / unsigned mutation requests are denied and signed writes still create audit rows with operator attribution and request hash.
- Capture a local screenshot of the moved platform page after focused tests pass.

## Review fixes

- Update the real-db approval integration suite so approval/reject/manual-review/reopen/submit requests are signed with the internal API HMAC helper.
- Keep legacy bearer-only denial coverage in the focused operator tests.
